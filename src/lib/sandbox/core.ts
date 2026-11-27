/**
 * Integration sandbox for Hostel POS (PMS by XTSY): the pure part. A test property takes bookings
 * from a simulated booking site or a partner's test key, the way a channel manager or an outside
 * booking engine would. Everything here is pure and tested (core.test.ts); the server side
 * (sandbox.server.ts) only loads and saves.
 *
 * Rules an online channel follows here, and later on a live property:
 * - Prices come from the PMS (room rate for the night, adjusted by the rate plan). A channel never
 *   sets its own price.
 * - Stop-sell, minimum stay, closed to arrival and closed to departure apply.
 * - One booking per channel booking id: a repeated "new" returns the stay already made.
 * - Changes and cancellations only while the stay is booked (not yet checked in).
 */
import { autoAssign, stayReference } from "../pms/assign";
import { addDays, isIsoDate, nightsOf } from "../pms/dates";
import { freeByNight, HOLDS_NIGHTS } from "../pms/inventory";
import { planRateOn, plansOf, quotePlan, restrictionProblems } from "../pms/plans";
import { closedOn } from "../pms/rates";
import { bookingProblems, MAX_STAY_NIGHTS } from "../pms/stay-flow";
import type { IsoDate, Stay, Unit, UnitType } from "../pms/types";

/** Booking sites and engines the simulator and test keys can book as. */
export const CHANNELS = [
  { id: "booking_com", name: "Booking.com" },
  { id: "agoda", name: "Agoda" },
  { id: "airbnb", name: "Airbnb" },
  { id: "makemytrip", name: "MakeMyTrip" },
  { id: "goibibo", name: "Goibibo" },
  { id: "expedia", name: "Expedia" },
  { id: "hostelworld", name: "Hostelworld" },
  { id: "xtsy_web", name: "xtsy.one" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];
export const channelName = (id: string): string => CHANNELS.find((c) => c.id === id)?.name ?? id;
export const isChannelId = (v: unknown): v is ChannelId => CHANNELS.some((c) => c.id === v);

export const MAX_ARI_DAYS = 90;
/** Bookings no further ahead than this (a year), like the booking sites. */
export const MAX_BOOKING_AHEAD_DAYS = 365;

export interface PartnerRoom {
  roomTypeId: string;
  planId?: string;
  units: number;
  guests: number;
}
export interface PartnerBooking {
  channel: ChannelId;
  /** The channel's own booking id: the same id always means the same stay. */
  channelBookingId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guest: { name: string; phone: string; email?: string; nationality?: string };
  rooms: PartnerRoom[];
  /** Already collected by the channel or engine, in rupees (shown as an advance on the folio). */
  paid?: number;
  notes?: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;

/** Validates a booking body from the API or the simulator. */
export function parsePartnerBooking(body: unknown): Parsed<PartnerBooking> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  if (!isChannelId(b["channel"]))
    return { ok: false, error: `channel must be one of: ${CHANNELS.map((c) => c.id).join(", ")}.` };
  const channelBookingId = str(b["channelBookingId"], 64);
  if (!channelBookingId || !/^[A-Za-z0-9._:-]+$/.test(channelBookingId))
    return {
      ok: false,
      error: "channelBookingId is required: letters, numbers, . _ : - (up to 64).",
    };
  const checkIn = b["checkIn"];
  const checkOut = b["checkOut"];
  if (
    typeof checkIn !== "string" ||
    !isIsoDate(checkIn) ||
    typeof checkOut !== "string" ||
    !isIsoDate(checkOut)
  )
    return { ok: false, error: "checkIn and checkOut are dates like 2026-12-24." };
  const g = (b["guest"] ?? {}) as Record<string, unknown>;
  const name = str(g["name"], 80);
  const phone = str(g["phone"], 20);
  if (!name || name.length < 2) return { ok: false, error: "guest.name is required." };
  if (!phone || !/^\+?[0-9 ]{8,16}$/.test(phone))
    return { ok: false, error: "guest.phone is a mobile number, e.g. +919876543210." };
  const email = g["email"] === undefined ? undefined : str(g["email"], 120);
  if (g["email"] !== undefined && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))
    return { ok: false, error: "guest.email isn't an email address." };
  const nationality = g["nationality"] === undefined ? undefined : str(g["nationality"], 2);
  if (g["nationality"] !== undefined && (!nationality || !/^[A-Za-z]{2}$/.test(nationality)))
    return { ok: false, error: "guest.nationality is a two-letter country code, e.g. IN." };
  if (!Array.isArray(b["rooms"]) || b["rooms"].length === 0 || b["rooms"].length > 10)
    return { ok: false, error: "rooms is a list of 1 to 10 room lines." };
  const rooms: PartnerRoom[] = [];
  for (const r of b["rooms"] as unknown[]) {
    const x = (r ?? {}) as Record<string, unknown>;
    const roomTypeId = str(x["roomTypeId"], 64);
    const units = x["units"];
    const guests = x["guests"];
    if (!roomTypeId) return { ok: false, error: "Each room line needs roomTypeId." };
    if (!Number.isInteger(units) || (units as number) < 1 || (units as number) > 20)
      return { ok: false, error: "units is a whole number from 1 to 20." };
    if (!Number.isInteger(guests) || (guests as number) < 1 || (guests as number) > 60)
      return { ok: false, error: "guests is a whole number from 1 to 60." };
    const planId = x["planId"] === undefined ? undefined : str(x["planId"], 64);
    if (x["planId"] !== undefined && !planId) return { ok: false, error: "planId isn't valid." };
    if (rooms.some((o) => o.roomTypeId === roomTypeId && o.planId === planId))
      return { ok: false, error: "Put each room type and plan on one line." };
    rooms.push({
      roomTypeId,
      units: units as number,
      guests: guests as number,
      ...(planId ? { planId } : {}),
    });
  }
  const paid = b["paid"];
  if (
    paid !== undefined &&
    (typeof paid !== "number" || !Number.isFinite(paid) || paid < 0 || paid > 10_000_000)
  )
    return { ok: false, error: "paid is an amount in rupees." };
  const notes = b["notes"] === undefined ? undefined : str(b["notes"], 300);
  return {
    ok: true,
    value: {
      channel: b["channel"],
      channelBookingId,
      checkIn,
      checkOut,
      guest: {
        name,
        phone,
        ...(email ? { email } : {}),
        ...(nationality ? { nationality: nationality.toUpperCase() } : {}),
      },
      rooms,
      ...(typeof paid === "number" && paid > 0 ? { paid: Math.round(paid * 100) / 100 } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

export interface ChangeRequest {
  checkIn?: IsoDate;
  checkOut?: IsoDate;
  guest?: { name?: string; phone?: string; email?: string };
}
export function parseChange(body: unknown): Parsed<ChangeRequest> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  const out: ChangeRequest = {};
  for (const k of ["checkIn", "checkOut"] as const) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "string" || !isIsoDate(b[k] as string))
      return { ok: false, error: `${k} is a date like 2026-12-24.` };
    out[k] = b[k] as string;
  }
  if (b["guest"] !== undefined) {
    const g = (b["guest"] ?? {}) as Record<string, unknown>;
    const guest: NonNullable<ChangeRequest["guest"]> = {};
    if (g["name"] !== undefined) {
      const v = str(g["name"], 80);
      if (!v || v.length < 2) return { ok: false, error: "guest.name isn't valid." };
      guest.name = v;
    }
    if (g["phone"] !== undefined) {
      const v = str(g["phone"], 20);
      if (!v || !/^\+?[0-9 ]{8,16}$/.test(v))
        return { ok: false, error: "guest.phone isn't a mobile number." };
      guest.phone = v;
    }
    if (g["email"] !== undefined) {
      const v = str(g["email"], 120);
      if (!v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))
        return { ok: false, error: "guest.email isn't an email address." };
      guest.email = v;
    }
    out.guest = guest;
  }
  if (!out.checkIn && !out.checkOut && !out.guest)
    return { ok: false, error: "Nothing to change: send checkIn, checkOut or guest." };
  return { ok: true, value: out };
}

/** One room type on one night, as a booking site sees it. */
export interface AriNight {
  date: IsoDate;
  available: number;
  /** Room only rate for the night, rupees before GST. */
  rate: number;
  closed: boolean;
  minStay: number;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  plans: { id: string; name: string; rate: number }[];
}
export interface AriRoomType {
  roomTypeId: string;
  name: string;
  soldAs: "bed" | "room";
  maxGuests: number;
  nights: AriNight[];
}

/** Availability, rates and restrictions for each room type over `days` nights from `from`. */
export function ariFor(
  types: UnitType[],
  units: Unit[],
  stays: Stay[],
  from: IsoDate,
  days: number,
): AriRoomType[] {
  const n = Math.max(1, Math.min(MAX_ARI_DAYS, Math.floor(days)));
  const to = addDays(from, n);
  return types
    .filter((t) => !t.archived)
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const free = freeByNight(t, units, stays, from, to);
      const plans = plansOf(t);
      return {
        roomTypeId: t.id,
        name: t.name,
        soldAs: t.soldAs,
        maxGuests: t.maxGuests,
        nights: nightsOf(from, to).map((date) => {
          const cal = t.calendar?.[date];
          const closed = closedOn(t, date);
          return {
            date,
            available: closed ? 0 : Math.max(0, free.get(date) ?? 0),
            rate: planRateOn(t, undefined, date),
            closed,
            minStay: cal?.minStay ?? 1,
            closedToArrival: !!cal?.cta,
            closedToDeparture: !!cal?.ctd,
            plans: plans.map((p) => ({ id: p.id, name: p.name, rate: planRateOn(t, p, date) })),
          };
        }),
      };
    });
}

/** The stay a channel booking already made, matched by channel and its booking id. */
export function stayForChannel(
  stays: Stay[],
  channel: ChannelId,
  channelBookingId: string,
): Stay | undefined {
  const name = channelName(channel);
  return stays.find((s) => s.ota?.name === name && s.ota.bookingId === channelBookingId);
}

/** Problems with the dates themselves, before rooms are looked at. */
function dateProblems(checkIn: IsoDate, checkOut: IsoDate, today: IsoDate): string[] {
  const out: string[] = [];
  const nights = nightsOf(checkIn, checkOut).length;
  if (checkIn < today) out.push("checkIn is in the past.");
  if (nights < 1) out.push("checkOut must be after checkIn.");
  if (nights > MAX_STAY_NIGHTS) out.push(`Stays are at most ${MAX_STAY_NIGHTS} nights.`);
  if (checkIn > addDays(today, MAX_BOOKING_AHEAD_DAYS))
    out.push(`Bookings open ${MAX_BOOKING_AHEAD_DAYS} days ahead.`);
  return out;
}

export interface BuildContext {
  types: UnitType[];
  units: Unit[];
  stays: Stay[];
  today: IsoDate;
  now: number;
  id: string;
  /** Who made it, for the stay's history: "sandbox:Booking.com" or "partner:<key name>". */
  by: string;
  random?: () => number;
}

/**
 * A new stay from a channel booking, or why not. Prices come from the PMS; restrictions apply;
 * beds/rooms are given straight away by the hostel rule (whole group in one room when it fits).
 */
export function buildPartnerStay(
  b: PartnerBooking,
  ctx: BuildContext,
): { stay: Stay } | { error: string } {
  const dp = dateProblems(b.checkIn, b.checkOut, ctx.today);
  if (dp.length) return { error: dp[0]! };
  const lines: Stay["lines"] = [];
  for (const r of b.rooms) {
    const type = ctx.types.find((t) => t.id === r.roomTypeId && !t.archived);
    if (!type)
      return { error: `Room type ${r.roomTypeId} doesn't exist here. GET /property lists them.` };
    const plan = r.planId ? plansOf(type).find((p) => p.id === r.planId) : plansOf(type)[0];
    if (!plan) return { error: `${type.name}: plan ${r.planId} isn't on sale.` };
    const restrict = restrictionProblems(type, b.checkIn, b.checkOut);
    if (restrict.length) return { error: restrict[0]! };
    lines.push({
      typeId: type.id,
      units: r.units,
      guests: r.guests,
      rate: quotePlan(type, plan, b.checkIn, b.checkOut),
      unitIds: [],
      planId: plan.id,
      planName: plan.name,
    });
  }
  const isWeb = b.channel === "xtsy_web";
  let stay: Stay = {
    id: ctx.id,
    reference: stayReference(b.checkIn, ctx.random),
    source: isWeb ? "website" : "ota",
    ota: { name: channelName(b.channel), bookingId: b.channelBookingId },
    status: "booked",
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    guest: { ...b.guest },
    lines,
    charges: [],
    payments: b.paid
      ? [
          {
            id: `${ctx.id}-paid`,
            kind: "advance",
            amount: b.paid,
            mode: isWeb ? "upi" : "ota_collect",
            at: ctx.now,
            by: ctx.by,
            reference: b.channelBookingId,
          },
        ]
      : [],
    ...(b.notes ? { notes: b.notes } : {}),
    createdAt: ctx.now,
    createdBy: ctx.by,
    history: [
      {
        at: ctx.now,
        by: ctx.by,
        what: `Booked on ${channelName(b.channel)} (${b.channelBookingId})`,
      },
    ],
    sandbox: true,
  };
  stay = autoAssign(stay, ctx.units, ctx.stays);
  const problems = bookingProblems(stay, ctx.types, ctx.units, [...ctx.stays, stay]);
  if (problems.length) return { error: problems[0]! };
  return { stay };
}

/**
 * New dates or guest details for a booked stay. Beds are re-given when the dates move (the same
 * ones when they're still free), restrictions apply to the new dates, and prices are re-quoted.
 */
export function changePartnerStay(
  stay: Stay,
  c: ChangeRequest,
  ctx: Omit<BuildContext, "id" | "random">,
): { stay: Stay } | { error: string } {
  if (stay.status !== "booked")
    return { error: `This booking is ${stay.status.replace("_", " ")} and can't be changed.` };
  const checkIn = c.checkIn ?? stay.checkIn;
  const checkOut = c.checkOut ?? stay.checkOut;
  const datesMoved = checkIn !== stay.checkIn || checkOut !== stay.checkOut;
  const what: string[] = [];
  let next: Stay = { ...stay, guest: { ...stay.guest, ...(c.guest ?? {}) } };
  if (c.guest) what.push("guest details");
  if (datesMoved) {
    const dp = dateProblems(checkIn, checkOut, ctx.today);
    if (dp.length) return { error: dp[0]! };
    const lines: Stay["lines"] = [];
    for (const l of stay.lines) {
      const type = ctx.types.find((t) => t.id === l.typeId);
      if (!type) return { error: "A room type on this booking no longer exists." };
      const restrict = restrictionProblems(type, checkIn, checkOut);
      if (restrict.length) return { error: restrict[0]! };
      const plan = plansOf(type).find((p) => p.id === l.planId) ?? plansOf(type)[0];
      lines.push({ ...l, rate: quotePlan(type, plan, checkIn, checkOut), unitIds: [] });
    }
    const others = ctx.stays.filter((s) => s.id !== stay.id);
    // Keep the same beds when they're still free on the new dates; otherwise give new ones.
    const kept: Stay = {
      ...next,
      checkIn,
      checkOut,
      lines: lines.map((l, i) => ({ ...l, unitIds: stay.lines[i]?.unitIds ?? [] })),
    };
    const keptOk = !bookingProblems(kept, ctx.types, ctx.units, [...others, kept]).length;
    next = keptOk ? kept : autoAssign({ ...next, checkIn, checkOut, lines }, ctx.units, others);
    what.push(`dates ${stay.checkIn} → ${stay.checkOut} to ${checkIn} → ${checkOut}`);
  }
  const problems = bookingProblems(next, ctx.types, ctx.units, [
    ...ctx.stays.filter((s) => s.id !== stay.id),
    next,
  ]);
  if (problems.length) return { error: problems[0]! };
  next.history = [
    ...(stay.history ?? []),
    { at: ctx.now, by: ctx.by, what: `Changed ${what.join(" and ")}` },
  ];
  return { stay: next };
}

export function cancelPartnerStay(
  stay: Stay,
  reason: string,
  ctx: { now: number; by: string },
): { stay: Stay } | { error: string } {
  if (stay.status === "cancelled") return { stay };
  if (stay.status !== "booked")
    return { error: `This booking is ${stay.status.replace("_", " ")} and can't be cancelled.` };
  const why = reason.trim().slice(0, 200);
  if (why.length < 4) return { error: "Say why the booking is cancelled (at least 4 letters)." };
  return {
    stay: {
      ...stay,
      status: "cancelled",
      cancelled: { at: ctx.now, by: ctx.by, reason: why },
      history: [...(stay.history ?? []), { at: ctx.now, by: ctx.by, what: `Cancelled: ${why}` }],
    },
  };
}

/** A stay as the API returns it: no internal ids of payments or charges. */
export function publicStay(s: Stay, types: UnitType[]) {
  const name = (id: string) => types.find((t) => t.id === id)?.name ?? id;
  const nights = nightsOf(s.checkIn, s.checkOut).length;
  const total = s.lines.reduce((n, l) => n + l.rate * l.units * nights, 0);
  const paid = s.payments.reduce((n, p) => n + (p.kind === "refund" ? -p.amount : p.amount), 0);
  return {
    id: s.id,
    reference: s.reference,
    status: s.status,
    channel: s.ota?.name ?? (s.source === "website" ? "xtsy.one" : s.source),
    channelBookingId: s.ota?.bookingId ?? null,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    nights,
    guest: {
      name: s.guest.name,
      phone: s.guest.phone,
      ...(s.guest.email ? { email: s.guest.email } : {}),
    },
    rooms: s.lines.map((l) => ({
      roomTypeId: l.typeId,
      roomType: name(l.typeId),
      planId: l.planId ?? null,
      plan: l.planName ?? null,
      units: l.units,
      guests: l.guests,
      nightlyRate: l.rate,
      assigned: l.unitIds.length,
    })),
    roomTotalBeforeGst: total,
    paid,
    cancelled: s.cancelled
      ? { at: new Date(s.cancelled.at).toISOString(), reason: s.cancelled.reason }
      : null,
    createdAt: new Date(s.createdAt).toISOString(),
  };
}

/** Stays that still hold rooms, for availability checks (cancelled and no-shows free theirs). */
export const holding = (stays: Stay[]): Stay[] => stays.filter(HOLDS_NIGHTS);

/* ---------- Keys and signatures (Web Crypto: works in the browser, Node and Workers) ---------- */

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A new partner test key: `xsb_test_` + 32 random letters. Shown once; only its hash is kept. */
export function newPartnerKey(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return `xsb_test_${[...random(32)].map((b) => abc[b % abc.length]).join("")}`;
}
export const isPartnerKeyShape = (k: string): boolean => /^xsb_test_[a-z2-9]{32}$/.test(k);
export const keyPrefix = (k: string): string => `${k.slice(0, 13)}…`;

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Webhook secret: `whsec_` + 32 random letters. */
export function newWebhookSecret(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  return `whsec_${hex(random(24).buffer as ArrayBuffer)}`;
}

/**
 * X-XTSY-Signature: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. A receiver
 * recomputes it with its secret and rejects anything older than 5 minutes.
 */
export async function signWebhook(
  secret: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return `t=${timestamp},v1=${hex(mac)}`;
}

/** Only public https addresses receive webhooks (no localhost or private networks). */
export function webhookUrlProblem(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Enter a full address starting with https://";
  }
  if (u.protocol !== "https:") return "Webhooks go only to https:// addresses.";
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) ||
    h.startsWith("[") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h)
  )
    return "Use a public web address, not an IP or a private network.";
  if (u.username || u.password) return "Don't put a login in the address.";
  return null;
}

/** Sample rooms for an empty test property: two dorms and a private room. */
export function sampleRooms(newId: () => string): { types: UnitType[]; units: Unit[] } {
  const mk = (
    name: string,
    soldAs: "bed" | "room",
    rate: number,
    maxGuests: number,
    order: number,
    femaleOnly = false,
  ): UnitType => ({
    id: newId(),
    name,
    soldAs,
    rate,
    maxGuests,
    femaleOnly,
    gst: "auto",
    order,
    plans: [
      { id: "room_only", name: "Room only", meal: "room_only", refundable: true, active: true },
      {
        id: "breakfast",
        name: "With breakfast",
        meal: "breakfast",
        refundable: true,
        adjust: 150,
        active: true,
      },
      {
        id: "nonref",
        name: "Non-refundable",
        meal: "room_only",
        refundable: false,
        adjustPct: -10,
        active: true,
      },
    ],
  });
  const dorm8 = mk("Bed in 8 Bed Dormitory", "bed", 400, 1, 1);
  const dorm6 = mk("Bed in 6 Bed Female Dormitory", "bed", 500, 1, 2, true);
  const priv = mk("Private Double Room", "room", 1800, 2, 3);
  const units: Unit[] = [];
  for (const l of "ABCDEFGH")
    units.push({
      id: newId(),
      typeId: dorm8.id,
      label: `1${l}`,
      room: "Room 1",
      housekeeping: "clean",
    });
  for (const l of "ABCDEF")
    units.push({
      id: newId(),
      typeId: dorm6.id,
      label: `2${l}`,
      room: "Room 2",
      housekeeping: "clean",
    });
  for (const n of ["301", "302"])
    units.push({ id: newId(), typeId: priv.id, label: n, room: n, housekeeping: "clean" });
  return { types: [dorm8, dorm6, priv], units };
}

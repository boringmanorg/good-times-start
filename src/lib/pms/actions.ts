/**
 * Front-desk writes. Every change is saved on this device first and synced like any POS record,
 * so the desk keeps working offline. Rules are checked here and again in the cloud.
 */
import { getDb, markDirty } from "../db";
import { newUid } from "../sync-core";
import { localDate } from "./dates";
import { pickUnits, unitsFreeFor } from "./inventory";
import { bookingProblems, canCancel, canCheckIn, canCheckOut, canMarkNoShow } from "./stay-flow";
import type { Housekeeping, PayMode, Stay, StayGuest, StayLine, Unit, UnitType } from "./types";

const clean = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);

export async function loadPms(): Promise<{ types: UnitType[]; units: Unit[]; stays: Stay[] }> {
  const db = getDb();
  const [types, units, stays] = await Promise.all([
    db.unitTypes.toArray(),
    db.units.toArray(),
    db.stays.toArray(),
  ]);
  return {
    types: types.filter((t) => !t.archived).sort((a, b) => a.order - b.order),
    units: units.filter((u) => !u.archived),
    stays,
  };
}

/* ---------------- Rooms and beds ---------------- */

export async function saveUnitType(
  input: Omit<UnitType, "id" | "order"> & { id?: string; order?: number },
): Promise<UnitType> {
  const name = clean(input.name, 80);
  if (name.length < 2) throw new Error("Name the room type.");
  if (!(input.rate >= 0) || input.rate > 500000) throw new Error("Enter a nightly rate.");
  if (!Number.isInteger(input.maxGuests) || input.maxGuests < 1 || input.maxGuests > 20)
    throw new Error("Guests per unit must be 1 to 20.");
  const db = getDb();
  const order = input.order ?? (await db.unitTypes.count()) + 1;
  const type: UnitType = {
    ...input,
    name,
    id: input.id ?? newUid(),
    order,
    maxGuests: input.soldAs === "bed" ? 1 : input.maxGuests,
    rate: Math.round(input.rate * 100) / 100,
  };
  await db.unitTypes.put(type);
  await markDirty(["unit_type", type.id]);
  return type;
}

/** Add beds or rooms: "Room 8" with beds A–H, or rooms "11", "12". Labels already in use are refused. */
export async function addUnits(typeId: string, room: string, labels: string[]): Promise<Unit[]> {
  const db = getDb();
  const type = await db.unitTypes.get(typeId);
  if (!type) throw new Error("Choose a room type.");
  const existing = new Set(
    (await db.units.toArray()).filter((u) => !u.archived).map((u) => u.label.toLowerCase()),
  );
  const wanted = labels.map((l) => clean(l, 20)).filter(Boolean);
  if (!wanted.length) throw new Error("Add at least one bed or room.");
  const dup = wanted.find((l) => existing.has(l.toLowerCase()));
  if (dup) throw new Error(`${dup} already exists.`);
  const made: Unit[] = wanted.map((label) => ({
    id: newUid(),
    typeId,
    label,
    room: clean(room, 40) || `Room ${label}`,
    housekeeping: "clean",
  }));
  await db.units.bulkPut(made);
  for (const u of made) await markDirty(["unit", u.id]);
  return made;
}

export async function setHousekeeping(
  unitId: string,
  state: Housekeeping,
  note?: string,
): Promise<void> {
  const db = getDb();
  const unit = await db.units.get(unitId);
  if (!unit) throw new Error("Bed or room not found.");
  if (state === "out_of_order" && !note?.trim()) throw new Error("Say why it's out of order.");
  const { note: _old, ...rest } = unit;
  void _old;
  await db.units.put({
    ...rest,
    housekeeping: state,
    ...(note?.trim() ? { note: clean(note, 120) } : {}),
  });
  await markDirty(["unit", unitId]);
}

/* ---------------- Stays ---------------- */

/** STY-261201-4F7K: date of arrival plus four letters, unique without a cloud call. */
export function stayReference(checkIn: string, random: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from({ length: 4 }, () => abc[Math.floor(random() * abc.length)]).join("");
  return `STY-${checkIn.slice(2).replace(/-/g, "")}-${tail}`;
}

export interface NewStay {
  source: Stay["source"];
  ota?: Stay["ota"];
  checkIn: string;
  checkOut: string;
  guest: StayGuest;
  femaleGuests?: number;
  lines: Omit<StayLine, "unitIds">[];
  notes?: string;
  advance?: { amount: number; mode: PayMode; reference?: string };
  /** Give beds/rooms now (walk-ins); otherwise at check-in. */
  assignNow?: boolean;
  /** Specific beds/rooms chosen on the tape chart, per type. */
  unitIds?: Record<string, string[]>;
}

export async function createStay(input: NewStay, by: string): Promise<Stay> {
  const { types, units, stays } = await loadPms();
  const now = Date.now();
  let stay: Stay = {
    id: newUid(),
    reference: stayReference(input.checkIn),
    source: input.source,
    ...(input.ota ? { ota: input.ota } : {}),
    status: "booked",
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guest: { ...input.guest, name: clean(input.guest.name, 80), phone: input.guest.phone.trim() },
    ...(input.femaleGuests ? { femaleGuests: input.femaleGuests } : {}),
    lines: input.lines.map((l) => ({
      ...l,
      unitIds: (input.unitIds?.[l.typeId] ?? []).slice(0, l.units),
    })),
    charges: [],
    payments: [],
    ...(input.notes?.trim() ? { notes: clean(input.notes, 300) } : {}),
    createdAt: now,
    createdBy: by,
  };
  if (input.assignNow) stay = autoAssign(stay, units, stays);
  const problems = bookingProblems(stay, types, units, [...stays, stay]);
  if (problems.length) throw new Error(problems[0]);
  if (input.advance && input.advance.amount > 0) {
    stay.payments.push({
      id: newUid(),
      kind: "advance",
      amount: Math.round(input.advance.amount * 100) / 100,
      mode: input.advance.mode,
      at: now,
      by,
      ...(input.advance.reference ? { reference: clean(input.advance.reference, 60) } : {}),
    });
  }
  await getDb().stays.put(stay);
  await markDirty(["stay", stay.id]);
  return stay;
}

/** Fill each line's missing beds/rooms by the hostel rule (whole group in one room when it fits). */
export function autoAssign(stay: Stay, units: Unit[], stays: Stay[]): Stay {
  const others = stays.filter((s) => s.id !== stay.id);
  const taken = new Set<string>();
  const lines = stay.lines.map((l) => {
    if (l.unitIds.length >= l.units) {
      l.unitIds.forEach((id) => taken.add(id));
      return l;
    }
    const free = unitsFreeFor(l.typeId, units, others, stay.checkIn, stay.checkOut).filter(
      (u) => !taken.has(u.id) && !l.unitIds.includes(u.id),
    );
    const picked = pickUnits(free, l.units - l.unitIds.length) ?? [];
    const unitIds = [...l.unitIds, ...picked.map((u) => u.id)];
    unitIds.forEach((id) => taken.add(id));
    return { ...l, unitIds };
  });
  return { ...stay, lines };
}

async function update(id: string, change: (s: Stay) => Stay): Promise<Stay> {
  const db = getDb();
  const s = await db.stays.get(id);
  if (!s) throw new Error("Booking not found.");
  const next = change(s);
  await db.stays.put(next);
  await markDirty(["stay", id]);
  return next;
}

export async function assignUnits(
  stayId: string,
  lineIndex: number,
  unitIds: string[] | "auto",
): Promise<Stay> {
  const { types, units, stays } = await loadPms();
  const s = stays.find((x) => x.id === stayId);
  if (!s) throw new Error("Booking not found.");
  let next: Stay;
  if (unitIds === "auto")
    next = autoAssign(
      { ...s, lines: s.lines.map((l, i) => (i === lineIndex ? { ...l, unitIds: [] } : l)) },
      units,
      stays,
    );
  else next = { ...s, lines: s.lines.map((l, i) => (i === lineIndex ? { ...l, unitIds } : l)) };
  const problems = bookingProblems(
    next,
    types,
    units,
    stays.map((x) => (x.id === stayId ? next : x)),
  );
  if (problems.length) throw new Error(problems[0]);
  return update(stayId, () => next);
}

export async function checkIn(
  stayId: string,
  guest: Partial<StayGuest>,
  by: string,
): Promise<Stay> {
  const { units, stays } = await loadPms();
  const s = stays.find((x) => x.id === stayId);
  if (!s) throw new Error("Booking not found.");
  const next = { ...s, guest: { ...s.guest, ...guest } };
  const why = canCheckIn(next, units, localDate());
  if (why) throw new Error(why);
  return update(stayId, () => ({ ...next, status: "checked_in", checkedInAt: Date.now() }));
}

/** Check-out marks every bed/room dirty for housekeeping. */
export async function checkOut(stayId: string, openRoomBills: number, by: string): Promise<Stay> {
  const { types, stays } = await loadPms();
  const s = stays.find((x) => x.id === stayId);
  if (!s) throw new Error("Booking not found.");
  const why = canCheckOut(s, types, openRoomBills);
  if (why) throw new Error(why);
  const done = await update(stayId, (x) => ({
    ...x,
    status: "checked_out",
    checkedOutAt: Date.now(),
  }));
  for (const id of s.lines.flatMap((l) => l.unitIds)) await setHousekeeping(id, "dirty");
  void by;
  return done;
}

export async function cancelStay(stayId: string, reason: string, by: string): Promise<Stay> {
  const s = await getDb().stays.get(stayId);
  if (!s) throw new Error("Booking not found.");
  const why = canCancel(s, reason);
  if (why) throw new Error(why);
  return update(stayId, (x) => ({
    ...x,
    status: "cancelled",
    cancelled: { at: Date.now(), by, reason: clean(reason, 200) },
  }));
}

export async function markNoShow(stayId: string): Promise<Stay> {
  const s = await getDb().stays.get(stayId);
  if (!s) throw new Error("Booking not found.");
  const why = canMarkNoShow(s, localDate());
  if (why) throw new Error(why);
  return update(stayId, (x) => ({ ...x, status: "no_show" }));
}

export async function addCharge(
  stayId: string,
  label: string,
  amount: number,
  gstPct: number,
  by: string,
): Promise<Stay> {
  if (clean(label, 80).length < 2) throw new Error("Say what the charge is for.");
  if (!(amount > 0) || amount > 500000) throw new Error("Enter an amount.");
  if (![0, 5, 12, 18, 28].includes(gstPct)) throw new Error("Choose a GST rate.");
  return update(stayId, (s) => {
    if (s.status === "checked_out" || s.status === "cancelled")
      throw new Error("This stay is closed.");
    return {
      ...s,
      charges: [
        ...s.charges,
        {
          id: newUid(),
          label: clean(label, 80),
          amount: Math.round(amount * 100) / 100,
          gstPct,
          at: Date.now(),
          by,
        },
      ],
    };
  });
}

export async function addPayment(
  stayId: string,
  p: { kind: "advance" | "payment" | "refund"; amount: number; mode: PayMode; reference?: string },
  by: string,
): Promise<Stay> {
  if (!(p.amount > 0) || p.amount > 5000000) throw new Error("Enter an amount.");
  return update(stayId, (s) => {
    if (s.status === "checked_out" || s.status === "cancelled")
      throw new Error("This stay is closed.");
    return {
      ...s,
      payments: [
        ...s.payments,
        {
          id: newUid(),
          kind: p.kind,
          amount: Math.round(p.amount * 100) / 100,
          mode: p.mode,
          at: Date.now(),
          by,
          ...(p.reference?.trim() ? { reference: clean(p.reference, 60) } : {}),
        },
      ],
    };
  });
}

export async function recordFormIII(stayId: string, reference: string, by: string): Promise<Stay> {
  return update(stayId, (s) => ({
    ...s,
    formIII: {
      at: Date.now(),
      by,
      ...(reference.trim() ? { reference: clean(reference, 60) } : {}),
    },
  }));
}

/** Rates & availability: change the rate and/or open/close a room type over a range of nights. */
export async function saveRates(
  typeId: string,
  from: string,
  to: string,
  change: { rate?: number | null; closed?: boolean },
  weekdays?: number[],
): Promise<UnitType> {
  const db = getDb();
  const t = await db.unitTypes.get(typeId);
  if (!t) throw new Error("Room type not found.");
  const { applyRange, pruneCalendar } = await import("./rates");
  const next: UnitType = {
    ...t,
    calendar: pruneCalendar(applyRange(t, from, to, change, weekdays), localDate()),
  };
  await db.unitTypes.put(next);
  await markDirty(["unit_type", typeId]);
  return next;
}

/* ---------------- Tape chart, rate plans, restrictions ---------------- */

/** Move a stay on the tape chart (another bed/room, other dates, new check-out). */
export async function moveStayTo(
  stayId: string,
  move: import("./tape").TapeMove,
  by: string,
): Promise<Stay> {
  const { types, units, stays } = await loadPms();
  const s = stays.find((x) => x.id === stayId);
  if (!s) throw new Error("Booking not found.");
  const { moveStay } = await import("./tape");
  const next = moveStay(s, move, types, units, stays, localDate(), by);
  if (next === s) return s;
  return update(stayId, () => next);
}

/** Owner/manager: the type's rate plans (room only, with breakfast, non-refundable…). */
export async function saveRatePlans(
  typeId: string,
  plans: import("./types").RatePlan[],
): Promise<UnitType> {
  const db = getDb();
  const t = await db.unitTypes.get(typeId);
  if (!t) throw new Error("Room type not found.");
  const { cleanPlans } = await import("./plans");
  const next: UnitType = { ...t, plans: cleanPlans(plans) };
  await db.unitTypes.put(next);
  await markDirty(["unit_type", typeId]);
  return next;
}

/** Owner/manager: minimum stay, closed to arrival/departure over a range of nights. */
export async function saveRestrictions(
  typeId: string,
  from: string,
  to: string,
  change: import("./plans").RestrictionChange,
  weekdays?: number[],
): Promise<UnitType> {
  const db = getDb();
  const t = await db.unitTypes.get(typeId);
  if (!t) throw new Error("Room type not found.");
  if (to < from) throw new Error("The end date is before the start date.");
  const { applyRestrictions } = await import("./plans");
  const { pruneCalendar } = await import("./rates");
  const next: UnitType = {
    ...t,
    calendar: pruneCalendar(applyRestrictions(t, from, to, change, weekdays), localDate()),
  };
  await db.unitTypes.put(next);
  await markDirty(["unit_type", typeId]);
  return next;
}

/* ---------------- Housekeeping board, night audit ---------------- */

/** Put someone on a bed/room's cleaning (or clear it with null). */
export async function setHousekeepingTask(
  unitId: string,
  assignee: string | null,
  by: string,
): Promise<void> {
  const db = getDb();
  const unit = await db.units.get(unitId);
  if (!unit) throw new Error("Bed or room not found.");
  const { task: _t, ...rest } = unit;
  void _t;
  const name = assignee ? clean(assignee, 40) : "";
  await db.units.put(name ? { ...rest, task: { assignee: name, at: Date.now(), by } } : rest);
  await markDirty(["unit", unitId]);
}

/** Cleaning done: the bed/room is clean and the task is cleared. */
export async function markCleaned(unitId: string): Promise<void> {
  const db = getDb();
  const unit = await db.units.get(unitId);
  if (!unit) throw new Error("Bed or room not found.");
  const { task: _t, note: _n, ...rest } = unit;
  void _t;
  void _n;
  await db.units.put({ ...rest, housekeeping: "clean", cleanedAt: Date.now() });
  await markDirty(["unit", unitId]);
}

/**
 * Close the day: mark the chosen no-shows (booked, due on or before the day) and keep the day's
 * figures. A day is closed once; the cloud refuses a second, different audit for the same date.
 */
export async function runNightAudit(
  day: string,
  noShowIds: string[],
  notes: string,
  by: string,
): Promise<import("./types").NightAudit> {
  const db = getDb();
  if (await db.nightAudits.get(day)) throw new Error(`${day} is already closed.`);
  for (const id of noShowIds) {
    const s = await db.stays.get(id);
    if (!s || s.status !== "booked" || s.checkIn > day)
      throw new Error("A no-show must be a booking due on or before the day being closed.");
    await update(id, (x) => ({
      ...x,
      status: "no_show",
      history: [
        ...(x.history ?? []),
        { at: Date.now(), by, what: `No-show at night audit ${day}` },
      ],
    }));
  }
  const { stays, units } = await loadPms();
  const { auditSummary } = await import("./day");
  const audit = auditSummary(stays, units, day, Date.now(), by, noShowIds, notes);
  await db.nightAudits.put(audit);
  await markDirty(["night_audit", audit.id]);
  return audit;
}

/* ---------------- Folio: extras, split payments, stay invoices ---------------- */

/** Sell one of the property's extras on the folio: per item, per night or per guest per night. */
export async function addExtra(
  stayId: string,
  extra: import("./types").StayExtra,
  qty: number,
  by: string,
): Promise<Stay> {
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error("Quantity must be 1 to 100.");
  return update(stayId, (s) => {
    if (s.status === "checked_out" || s.status === "cancelled" || s.status === "no_show")
      throw new Error("This stay is closed.");
    const nights = Math.max(
      1,
      Math.round(
        (Date.parse(`${s.checkOut}T00:00:00Z`) - Date.parse(`${s.checkIn}T00:00:00Z`)) / 86_400_000,
      ),
    );
    const guests = s.lines.reduce((n, l) => n + l.guests, 0);
    const units =
      extra.per === "item" ? qty : extra.per === "night" ? qty * nights : qty * nights * guests;
    const label = `${extra.label}${units > 1 ? ` × ${units}` : ""}`;
    return {
      ...s,
      charges: [
        ...s.charges,
        {
          id: newUid(),
          label: clean(label, 80),
          amount: Math.round(extra.price * units * 100) / 100,
          gstPct: extra.gstPct,
          at: Date.now(),
          by,
          extraId: extra.id,
          qty: units,
        },
      ],
    };
  });
}

/** Several payments at once (part cash, part UPI…), each recorded on its own. */
export async function addPayments(
  stayId: string,
  parts: { amount: number; mode: PayMode; reference?: string }[],
  by: string,
): Promise<Stay> {
  const good = parts.filter((p) => p.amount > 0);
  if (!good.length) throw new Error("Enter an amount.");
  if (good.some((p) => p.amount > 5000000)) throw new Error("Check the amounts.");
  return update(stayId, (s) => {
    if (s.status === "checked_out" || s.status === "cancelled" || s.status === "no_show")
      throw new Error("This stay is closed.");
    const at = Date.now();
    return {
      ...s,
      payments: [
        ...s.payments,
        ...good.map((p) => ({
          id: newUid(),
          kind: "payment" as const,
          amount: Math.round(p.amount * 100) / 100,
          mode: p.mode,
          at,
          by,
          ...(p.reference?.trim() ? { reference: clean(p.reference, 60) } : {}),
        })),
      ],
    };
  });
}

/**
 * Check-out with a strict GST invoice: the number comes from the cloud's STAY series (it needs
 * the internet), asked for with a request id derived from the stay so a retry gets the same
 * number. Every bed/room then goes to housekeeping.
 */
export async function checkOutWithInvoice(
  stayId: string,
  openRoomBills: number,
  by: string,
): Promise<Stay> {
  const { types, stays } = await loadPms();
  const s = stays.find((x) => x.id === stayId);
  if (!s) throw new Error("Booking not found.");
  const why = canCheckOut(s, types, openRoomBills);
  if (why) throw new Error(why);
  const { stayInvoiceNumber } = await import("./invoice");
  const no = s.invoice?.no ?? (await stayInvoiceNumber(s.id));
  const done = await update(stayId, (x) => ({
    ...x,
    status: "checked_out",
    checkedOutAt: Date.now(),
    invoice: x.invoice ?? { no, at: Date.now() },
  }));
  for (const id of s.lines.flatMap((l) => l.unitIds)) await setHousekeeping(id, "dirty");
  void by;
  return done;
}

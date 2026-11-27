/**
 * Hostel POS ← booking engine (xtsy.one): room types, beds/rooms and nights already sold, pulled on
 * each sync. Pure and tested (engine-sync.test.ts); the client action loads, plans and saves.
 *
 * Why this way round for now (owner, 27 Nov 2026): the booking engine already holds the property's
 * real room types and live counts (the owner's sheet, OTA bookings through ZimmerStack, website
 * bookings and console blocks). Hostel POS mirrors them so the desk never sells a bed that is gone,
 * and so every room type carries one id from the website through to the booking sites. When the
 * property switches over, Hostel POS becomes the one system ZimmerStack talks to, with the same ids.
 *
 * Rules:
 * - Ids are fixed from the engine's ids (`eng-<id>`, `eng-<id>-<label>`), so two devices syncing at
 *   once write the same records instead of making duplicates.
 * - The engine decides names, how a type is sold, guests per unit, women-only, the base rate and
 *   the order; Hostel POS keeps its own rate plans, per-night rates and restrictions.
 * - A night's `held` = beds/rooms the engine says are sold. Hostel POS's own desk bookings are taken
 *   off on top, so while both run the desk under-sells rather than overbooks.
 * - Types and units the owner made by hand are never touched. Engine units no longer in the feed
 *   are archived, never deleted, and only when no current stay uses them.
 * - Only records that actually change are returned, so a sync with nothing new writes nothing.
 */
import { addDays, isIsoDate } from "./dates";
import { HOLDS_NIGHTS } from "./inventory";
import type { IsoDate, NightPlan, Stay, Unit, UnitType } from "./types";

/** Hosts Hostel POS pulls from. Anything else is refused (no fetching arbitrary addresses). */
export const ENGINE_HOSTS = ["xtsy.one", "www.xtsy.one"] as const;
export const ENGINE_FEED_PATH = "/api/public/pms-feed";
/** How often an open Property Manager pulls by itself. */
export const ENGINE_SYNC_EVERY_MS = 10 * 60_000;

export interface EngineFeedType {
  id: string;
  name: string;
  descriptor?: string;
  soldAs: "bed" | "room";
  units: number;
  rate: number;
  maxGuests: number;
  femaleOnly: boolean;
  order: number;
  unitsOnFloor: { label: string; room: string }[];
}
export interface EngineFeed {
  version: 1;
  source: string;
  generatedAt: string;
  from: IsoDate;
  days: number;
  roomTypes: EngineFeedType[];
  free: Record<string, Record<IsoDate, number>>;
}

/** The feed address for a booking engine's site, or why not. */
export function engineFeedUrl(site: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(site.trim()) ? site.trim() : `https://${site.trim()}`);
  } catch {
    return { error: "Enter the booking engine's address, e.g. xtsy.one." };
  }
  if (u.protocol !== "https:") return { error: "The booking engine must use https." };
  if (!(ENGINE_HOSTS as readonly string[]).includes(u.hostname.toLowerCase()))
    return { error: `Hostel POS pulls only from ${ENGINE_HOSTS.join(" or ")} for now.` };
  return { url: `https://${u.hostname.toLowerCase()}${ENGINE_FEED_PATH}` };
}

const isStr = (v: unknown, max = 120): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Checks the feed's shape before anything is written; a bad feed changes nothing. */
export function parseEngineFeed(
  body: unknown,
): { ok: true; feed: EngineFeed } | { ok: false; error: string } {
  const b = body as Partial<EngineFeed> | null;
  if (!b || typeof b !== "object" || b.version !== 1)
    return { ok: false, error: "The booking engine sent a feed this version doesn't read." };
  if (!Array.isArray(b.roomTypes) || b.roomTypes.length === 0 || b.roomTypes.length > 60)
    return { ok: false, error: "The booking engine sent no room types." };
  if (
    !isStr(b.from, 10) ||
    !isIsoDate(b.from) ||
    !isInt(b.days, 1, 400) ||
    !b.free ||
    typeof b.free !== "object"
  )
    return { ok: false, error: "The booking engine's counts are incomplete." };
  const ids = new Set<string>();
  for (const t of b.roomTypes) {
    if (!t || !isStr(t.id, 64) || !/^[a-z0-9-]+$/.test(t.id) || ids.has(t.id))
      return { ok: false, error: "A room type in the feed has a bad id." };
    ids.add(t.id);
    if (
      !isStr(t.name, 80) ||
      (t.soldAs !== "bed" && t.soldAs !== "room") ||
      !isInt(t.units, 0, 500) ||
      !(typeof t.rate === "number" && t.rate >= 0 && t.rate <= 500000) ||
      !isInt(t.maxGuests, 1, 20) ||
      typeof t.femaleOnly !== "boolean" ||
      !isInt(t.order, 0, 1000) ||
      !Array.isArray(t.unitsOnFloor) ||
      t.unitsOnFloor.length > 500
    )
      return { ok: false, error: `Room type ${t.id} in the feed is incomplete.` };
    const labels = new Set<string>();
    for (const u of t.unitsOnFloor) {
      if (!u || !isStr(u.label, 20) || !isStr(u.room, 40) || labels.has(u.label))
        return {
          ok: false,
          error: `${t.name}: a bed or room label in the feed is missing or repeated.`,
        };
      labels.add(u.label);
    }
    const nights = (b.free as Record<string, unknown>)[t.id];
    if (nights !== undefined) {
      if (!nights || typeof nights !== "object")
        return { ok: false, error: `${t.name}: bad counts.` };
      for (const [night, n] of Object.entries(nights))
        if (!isIsoDate(night) || !isInt(n, 0, 500))
          return { ok: false, error: `${t.name}: bad count on ${night}.` };
    }
  }
  return { ok: true, feed: b as EngineFeed };
}

export const engineTypeId = (engineId: string) => `eng-${engineId}`;
export const engineUnitId = (engineId: string, label: string) =>
  `eng-${engineId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export interface EngineSyncPlan {
  types: UnitType[];
  units: Unit[];
  /** One line per change, for the screen and the audit log ("Added Bed in 8 Bed Mixed Dormitory"). */
  changes: string[];
  /** Units the engine no longer lists but a current stay still uses (left in place). */
  kept: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The night's plan with `held` set to n (or removed), dropping empty plans. */
function withHeld(plan: NightPlan | undefined, n: number): NightPlan | undefined {
  const next: NightPlan = { ...(plan ?? {}) };
  if (n > 0) next.held = n;
  else delete next.held;
  return Object.keys(next).length ? next : undefined;
}

export function planEngineSync(
  feed: EngineFeed,
  types: UnitType[],
  units: Unit[],
  stays: Stay[],
  today: IsoDate,
): EngineSyncPlan {
  const out: EngineSyncPlan = { types: [], units: [], changes: [], kept: [] };
  const live = stays.filter(HOLDS_NIGHTS);
  const usedUnit = (id: string) =>
    live.some((s) => s.checkOut > today && s.lines.some((l) => l.unitIds.includes(id)));
  const usedType = (id: string) =>
    live.some((s) => s.checkOut > today && s.lines.some((l) => l.typeId === id));
  const feedIds = new Set(feed.roomTypes.map((t) => t.id));
  const windowEnd = addDays(feed.from, feed.days);

  for (const ft of feed.roomTypes) {
    const id = engineTypeId(ft.id);
    const prior = types.find((t) => t.id === id) ?? types.find((t) => t.engineRef === ft.id);
    const typeId = prior?.id ?? id;
    const wanted = ft.unitsOnFloor.map((u) => ({
      id: engineUnitId(ft.id, u.label),
      label: u.label,
      room: u.room,
    }));
    const wantedIds = new Set(wanted.map((w) => w.id));
    for (const w of wanted) {
      const have = units.find((u) => u.id === w.id);
      const next: Unit = have
        ? { ...have, typeId, label: w.label, room: w.room, fromEngine: true }
        : {
            id: w.id,
            typeId,
            label: w.label,
            room: w.room,
            housekeeping: "clean",
            fromEngine: true,
          };
      if (next.archived) delete next.archived;
      if (!have || !same(have, next)) {
        out.units.push(next);
        out.changes.push(have ? `${ft.name}: ${w.label} updated` : `${ft.name}: added ${w.label}`);
      }
    }
    for (const u of units.filter(
      (x) => x.typeId === typeId && x.fromEngine && !x.archived && !wantedIds.has(x.id),
    )) {
      if (usedUnit(u.id)) {
        out.kept.push(`${ft.name}: ${u.label} (a current stay uses it)`);
        continue;
      }
      out.units.push({ ...u, archived: true });
      out.changes.push(`${ft.name}: ${u.label} retired (no longer on the booking engine)`);
    }

    const calendar: Record<IsoDate, NightPlan> = {};
    for (const [night, plan] of Object.entries(prior?.calendar ?? {})) {
      if (night < today) continue;
      // Inside the feed's window the engine's count is the truth; outside it, keep what was there.
      if (night >= feed.from && night < windowEnd) {
        const kept = withHeld(plan, 0);
        if (kept) calendar[night] = kept;
      } else calendar[night] = plan;
    }
    for (const [night, free] of Object.entries(feed.free[ft.id] ?? {})) {
      if (night < today || night < feed.from || night >= windowEnd) continue;
      // Sold = what the engine sells minus what it says is still free.
      const held = Math.max(0, Math.min(ft.units, ft.units - free));
      const next = withHeld(calendar[night], held);
      if (next) calendar[night] = next;
      else delete calendar[night];
    }
    const next: UnitType = {
      ...(prior ?? { gst: "auto", plans: undefined }),
      id: typeId,
      name: ft.name,
      soldAs: ft.soldAs,
      rate: ft.rate,
      maxGuests: ft.maxGuests,
      femaleOnly: ft.femaleOnly,
      order: ft.order,
      engineRef: ft.id,
      // The engine's ids are the room-type refs it sends to ZimmerStack: keep one id end to end.
      channelRef: prior?.channelRef ?? ft.id,
      ...(ft.descriptor ? { descriptor: ft.descriptor } : {}),
      calendar,
    } as UnitType;
    if (!ft.descriptor) delete next.descriptor;
    if (!next.plans) delete next.plans;
    if (next.archived) delete next.archived;
    if (!prior || !same(prior, next)) {
      out.types.push(next);
      if (!prior)
        out.changes.push(
          `Added ${ft.name} (${ft.units} ${ft.soldAs === "bed" ? "beds" : "rooms"}, ₹${ft.rate}/night)`,
        );
      else {
        const what: string[] = [];
        if (prior.name !== next.name) what.push(`renamed from ${prior.name}`);
        if (prior.rate !== next.rate) what.push(`base rate ₹${prior.rate} → ₹${next.rate}`);
        if (
          prior.maxGuests !== next.maxGuests ||
          prior.soldAs !== next.soldAs ||
          prior.femaleOnly !== next.femaleOnly
        )
          what.push("details updated");
        if (!same(prior.calendar ?? {}, next.calendar)) what.push("nights sold elsewhere updated");
        if (what.length) out.changes.push(`${ft.name}: ${what.join(", ")}`);
      }
    }
  }

  // Types that came from the engine but it no longer sells: archived once no current stay uses them.
  for (const t of types.filter((x) => x.engineRef && !x.archived && !feedIds.has(x.engineRef))) {
    if (usedType(t.id)) {
      out.kept.push(`${t.name} (current stays use it)`);
      continue;
    }
    out.types.push({ ...t, archived: true });
    out.changes.push(`${t.name} retired (no longer on the booking engine)`);
    for (const u of units.filter((x) => x.typeId === t.id && !x.archived))
      out.units.push({ ...u, archived: true });
  }
  return out;
}

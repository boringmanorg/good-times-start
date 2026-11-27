/**
 * Who sleeps where on which night: free units, clashes and bed assignment.
 * Pure; the front desk loads units and stays and passes them in.
 */
import { nightsOf } from "./dates";
import type { IsoDate, Stay, Unit, UnitType } from "./types";

/** Stays that still hold their nights. */
export const HOLDS_NIGHTS = (s: Stay) => s.status === "booked" || s.status === "checked_in";

const sellable = (u: Unit) => !u.archived && u.housekeeping !== "out_of_order";

/** unitId → night → stay id, from stays that hold their nights and have units given. */
export function occupancy(stays: Stay[], from: IsoDate, to: IsoDate): Map<string, Map<IsoDate, string>> {
  const window = new Set(nightsOf(from, to));
  const map = new Map<string, Map<IsoDate, string>>();
  for (const s of stays) {
    if (!HOLDS_NIGHTS(s)) continue;
    for (const night of nightsOf(s.checkIn, s.checkOut)) {
      if (!window.has(night)) continue;
      for (const line of s.lines) for (const unitId of line.unitIds) {
        const row = map.get(unitId) ?? new Map<IsoDate, string>();
        row.set(night, s.id);
        map.set(unitId, row);
      }
    }
  }
  return map;
}

/**
 * Units of a type still on sale each night: sellable units minus every booking of that type,
 * given a bed yet or not. A booking without beds still takes one off the count.
 */
export function freeByNight(type: UnitType, units: Unit[], stays: Stay[], from: IsoDate, to: IsoDate, ignoreStayId?: string): Map<IsoDate, number> {
  const capacity = units.filter((u) => u.typeId === type.id && sellable(u)).length;
  const out = new Map<IsoDate, number>();
  // Nights already sold outside Hostel POS (booking engine feed) come off first.
  for (const night of nightsOf(from, to)) out.set(night, capacity - Math.max(0, type.calendar?.[night]?.held ?? 0));
  for (const s of stays) {
    if (!HOLDS_NIGHTS(s) || s.id === ignoreStayId) continue;
    const taken = s.lines.filter((l) => l.typeId === type.id).reduce((n, l) => n + l.units, 0);
    if (!taken) continue;
    for (const night of nightsOf(s.checkIn, s.checkOut)) if (out.has(night)) out.set(night, (out.get(night) ?? 0) - taken);
  }
  return out;
}

/** Fewest free units of a type over a stay: what can still be sold for those dates. */
export function freeForStay(type: UnitType, units: Unit[], stays: Stay[], checkIn: IsoDate, checkOut: IsoDate, ignoreStayId?: string): number {
  const nights = [...freeByNight(type, units, stays, checkIn, checkOut, ignoreStayId).values()];
  return nights.length ? Math.max(0, Math.min(...nights)) : 0;
}

/** Units of a type with no stay on any of these nights. */
export function unitsFreeFor(typeId: string, units: Unit[], stays: Stay[], checkIn: IsoDate, checkOut: IsoDate, ignoreStayId?: string): Unit[] {
  const occ = occupancy(stays.filter((s) => s.id !== ignoreStayId), checkIn, checkOut);
  const nights = nightsOf(checkIn, checkOut);
  return units
    .filter((u) => u.typeId === typeId && sellable(u))
    .filter((u) => !nights.some((n) => occ.get(u.id)?.has(n)))
    .sort(byLabel);
}

/** "2B" before "10A": number first, then letter. */
export function byLabel(a: Unit, b: Unit): number {
  return a.label.localeCompare(b.label, "en", { numeric: true });
}

/**
 * Beds or rooms for a group: the lowest-numbered room that fits the whole group, split across
 * rooms only when none does (the owner's rule for the hostel sheet). Null when not enough are free.
 */
export function pickUnits(free: Unit[], count: number): Unit[] | null {
  if (count <= 0) return [];
  if (free.length < count) return null;
  const byRoom = new Map<string, Unit[]>();
  for (const u of [...free].sort(byLabel)) byRoom.set(u.room, [...(byRoom.get(u.room) ?? []), u]);
  const rooms = [...byRoom.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));
  const whole = rooms.find(([, us]) => us.length >= count);
  if (whole) return whole[1].slice(0, count);
  // No room fits everyone: fill the fullest-free rooms first so the group splits as little as possible.
  const picked: Unit[] = [];
  for (const [, us] of [...rooms].sort((a, b) => b[1].length - a[1].length)) {
    for (const u of us) { if (picked.length < count) picked.push(u); }
  }
  return picked.sort(byLabel);
}

/** Two stays on the same unit and night: never allowed; listed so the desk can move one. */
export function clashes(stays: Stay[]): { unitId: string; night: IsoDate; stayIds: [string, string] }[] {
  const seen = new Map<string, string>();
  const out: { unitId: string; night: IsoDate; stayIds: [string, string] }[] = [];
  for (const s of stays) {
    if (!HOLDS_NIGHTS(s)) continue;
    for (const night of nightsOf(s.checkIn, s.checkOut)) for (const line of s.lines) for (const unitId of line.unitIds) {
      const key = `${unitId}|${night}`;
      const other = seen.get(key);
      if (other && other !== s.id) out.push({ unitId, night, stayIds: [other, s.id] });
      else seen.set(key, s.id);
    }
  }
  return out;
}

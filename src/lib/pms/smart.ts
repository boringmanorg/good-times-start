/**
 * The "smart" layer of Hostel & Hotel POS: rate suggestions and plain-language nudges worked out
 * from the property's own bookings. Pure and tested (smart.test.ts); nothing here changes a rate
 * or a booking by itself — a person applies a suggestion with one tap on Rates.
 *
 * Rules, per room type and night:
 *  - how full the night already is (sold ÷ sellable units),
 *  - how far away it is (days ahead),
 *  - Friday and Saturday nights.
 * Busy nights go up (+10% from 70% full, +20% from 85%, plus 10% more on a weekend from 50%);
 * nights within 3 days that are under 40% full come down 10% to fill late beds. A suggestion
 * never goes below 70% or above 160% of the base rate, and rounds to ₹10 (₹50 above ₹2,000).
 * Closed and sold-out nights get no suggestion.
 */
import { addDays, daysBetween, nightsOf, shortDay } from "./dates";
import { folioOf } from "./folio";
import { rateGrid, type GridCell } from "./rates";
import type { IsoDate, Stay, Unit, UnitType } from "./types";

export interface RateSuggestion {
  typeId: string;
  typeName: string;
  night: IsoDate;
  current: number;
  suggested: number;
  /** Why, in a few words. */
  reason: string;
  occupancyPct: number;
}

export const weekdayOf = (night: IsoDate): number => new Date(`${night}T00:00:00Z`).getUTCDay();
const isWeekendNight = (night: IsoDate) => { const d = weekdayOf(night); return d === 5 || d === 6; };

export function roundRate(n: number): number {
  const step = n > 2000 ? 50 : 10;
  return Math.max(step, Math.round(n / step) * step);
}

/** One night's suggestion, or null when the rate is fine as it is. */
export function suggestFor(base: number, cell: Pick<GridCell, "night" | "free" | "sold" | "rate" | "closed">, total: number, today: IsoDate): { suggested: number; reason: string; occupancyPct: number } | null {
  if (cell.closed || total <= 0 || cell.free <= 0 || base <= 0) return null;
  const occ = Math.round((cell.sold / total) * 100);
  const ahead = daysBetween(today, cell.night);
  if (ahead < 0) return null;
  let factor = 1;
  const why: string[] = [];
  if (occ >= 85) { factor += 0.2; why.push(`${occ}% full`); }
  else if (occ >= 70) { factor += 0.1; why.push(`${occ}% full`); }
  if (isWeekendNight(cell.night) && occ >= 50) { factor += 0.1; why.push("weekend"); }
  if (ahead <= 3 && occ < 40) { factor -= 0.1; why.push(ahead === 0 ? "tonight, still empty beds" : `${ahead} day${ahead === 1 ? "" : "s"} away, ${occ}% full`); }
  if (why.length === 0) return null;
  const suggested = roundRate(Math.min(base * 1.6, Math.max(base * 0.7, base * factor)));
  if (Math.abs(suggested - cell.rate) < Math.max(10, cell.rate * 0.03)) return null;
  // Only move the way the reason points: a night already raised by hand isn't pulled back down
  // because it is busy, and a night already cut isn't pushed up because it is empty.
  if (factor > 1 && suggested <= cell.rate) return null;
  if (factor < 1 && suggested >= cell.rate) return null;
  return { suggested, reason: why.join(" · "), occupancyPct: occ };
}

/** Suggestions over the next `days` nights for every room type, soonest first. */
export function rateSuggestions(types: UnitType[], units: Unit[], stays: Stay[], today: IsoDate, days = 30): RateSuggestion[] {
  const out: RateSuggestion[] = [];
  for (const row of rateGrid(types.filter((t) => !t.archived), units, stays, today, days)) {
    for (const cell of row.cells) {
      const s = suggestFor(row.type.rate, cell, row.total, today);
      if (s) out.push({ typeId: row.type.id, typeName: row.type.name, night: cell.night, current: cell.rate, ...s });
    }
  }
  return out.sort((a, b) => a.night.localeCompare(b.night) || a.typeName.localeCompare(b.typeName));
}

export type InsightTone = "good" | "watch" | "act";
export interface Insight { id: string; tone: InsightTone; title: string; detail: string }

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Short, plain nudges for the Home screen: slow nights ahead, sold-out nights, booking pickup
 * this week against last week, how much comes through booking sites, and money still owed by
 * guests in the house.
 */
export function stayInsights(types: UnitType[], units: Unit[], stays: Stay[], today: IsoDate, now: number = Date.now()): Insight[] {
  const out: Insight[] = [];
  const grid = rateGrid(types.filter((t) => !t.archived), units, stays, today, 14);
  const total = grid.reduce((s, r) => s + r.total, 0);
  if (total === 0) return out;
  const nights = nightsOf(today, addDays(today, 14));
  const byNight = nights.map((night, i) => {
    const sold = grid.reduce((s, r) => s + (r.cells[i]?.sold ?? 0), 0);
    return { night, sold, pct: Math.round((sold / total) * 100) };
  });

  const slow = byNight.slice(0, 7).filter((n) => n.pct < 30);
  if (slow.length) {
    out.push({ id: "slow", tone: "act", title: `${slow.length} slow night${slow.length === 1 ? "" : "s"} this week`,
      detail: `${slow.slice(0, 3).map((n) => `${shortDay(n.night)} ${n.pct}%`).join("; ")}${slow.length > 3 ? " and more" : ""}. A small drop or a WhatsApp offer to past guests can fill them.` });
  }
  const full = grid.flatMap((r) => r.cells.filter((c) => c.free === 0 && !c.closed && r.total > 0).map((c) => ({ night: c.night, name: r.type.name })));
  if (full.length) {
    out.push({ id: "full", tone: "good", title: `Sold out on ${full.length} room-type night${full.length === 1 ? "" : "s"}`,
      detail: `${full.slice(0, 3).map((f) => `${f.name}, ${shortDay(f.night)}`).join("; ")}${full.length > 3 ? " and more" : ""}. Next time, raise those nights earlier.` });
  }

  const week = 7 * 86_400_000;
  const live = stays.filter((s) => s.status !== "cancelled");
  const thisWeek = live.filter((s) => s.createdAt > now - week).length;
  const lastWeek = live.filter((s) => s.createdAt <= now - week && s.createdAt > now - 2 * week).length;
  if (thisWeek || lastWeek) {
    const up = thisWeek >= lastWeek;
    out.push({ id: "pickup", tone: up ? "good" : "watch", title: `${thisWeek} new booking${thisWeek === 1 ? "" : "s"} in 7 days`,
      detail: lastWeek ? `${up ? "Up" : "Down"} from ${lastWeek} the week before.` : "None the week before." });
  }

  const recent = live.filter((s) => s.createdAt > now - 30 * 86_400_000);
  if (recent.length >= 4) {
    const ota = recent.filter((s) => s.source === "ota").length;
    const pct = Math.round((ota / recent.length) * 100);
    if (pct >= 60) out.push({ id: "ota", tone: "watch", title: `${pct}% of bookings came through booking sites`,
      detail: "Each one pays a commission. Returning guests can book direct on your own website." });
  }

  const owed = stays.filter((s) => s.status === "checked_in").map((s) => ({ s, due: Math.round(folioOf(s, types).due) })).filter((x) => x.due > 0);
  if (owed.length) {
    out.push({ id: "owed", tone: "watch", title: `${money(owed.reduce((a, x) => a + x.due, 0))} still to collect in the house`,
      detail: `${owed.length} guest${owed.length === 1 ? "" : "s"} checked in with money due. Collect before check-out day.` });
  }
  return out;
}


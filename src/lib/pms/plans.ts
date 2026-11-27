/**
 * Rate plans and stay restrictions (what modern channel managers sync besides price and count):
 * room only / with breakfast / non-refundable plans priced off the room's nightly rate, and per
 * night minimum stay, closed to arrival and closed to departure. Pure; tested in plans.test.ts.
 *
 * Online channels (booking sites, the website, the sandbox) must obey restrictions; the desk sees
 * them as warnings and can still book.
 */
import { addDays, nightsOf } from "./dates";
import { closedOn, rateOn } from "./rates";
import type { IsoDate, MealPlan, RatePlan, UnitType } from "./types";

export const MEAL_NAMES: Record<MealPlan, string> = {
  room_only: "Room only",
  breakfast: "With breakfast",
  half_board: "Breakfast and dinner",
  full_board: "All meals",
};

/** A type's active plans; every type sells at least "Room only" at its own rate. */
export function plansOf(t: UnitType): RatePlan[] {
  const active = (t.plans ?? []).filter((p) => p.active);
  return active.length
    ? active
    : [{ id: "standard", name: "Room only", meal: "room_only", refundable: true, active: true }];
}

/** A plan's rate on one night: the room's rate for that night, adjusted by the plan. */
export function planRateOn(t: UnitType, plan: RatePlan | undefined, night: IsoDate): number {
  const base = rateOn(t, night);
  if (!plan) return base;
  const pct = plan.adjustPct ? (base * plan.adjustPct) / 100 : 0;
  return Math.max(0, Math.round(base + (plan.adjust ?? 0) + pct));
}

/** Average nightly rate of a plan over a stay, to the rupee. */
export function quotePlan(
  t: UnitType,
  plan: RatePlan | undefined,
  checkIn: IsoDate,
  checkOut: IsoDate,
): number {
  const nights = nightsOf(checkIn, checkOut);
  if (!nights.length) return planRateOn(t, plan, checkIn);
  return Math.round(nights.reduce((s, n) => s + planRateOn(t, plan, n), 0) / nights.length);
}

/** Why an online channel may not sell these dates (stop-sell, min stay, CTA, CTD); empty when it may. */
export function restrictionProblems(t: UnitType, checkIn: IsoDate, checkOut: IsoDate): string[] {
  const out: string[] = [];
  const nights = nightsOf(checkIn, checkOut);
  const closed = nights.filter((n) => closedOn(t, n));
  if (closed.length)
    out.push(
      `${t.name} is closed to sale on ${closed.length === 1 ? closed[0] : `${closed.length} of these nights`}.`,
    );
  const arrival = t.calendar?.[checkIn];
  if (arrival?.minStay && nights.length < arrival.minStay)
    out.push(`${t.name}: arrivals on ${checkIn} stay at least ${arrival.minStay} nights.`);
  if (arrival?.cta) out.push(`${t.name} is closed to arrival on ${checkIn}.`);
  if (t.calendar?.[checkOut]?.ctd) out.push(`${t.name} is closed to departure on ${checkOut}.`);
  return out;
}

/** Validate and tidy a plan list before saving. */
export function cleanPlans(plans: RatePlan[]): RatePlan[] {
  const seen = new Set<string>();
  return plans.map((p) => {
    const name = p.name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (name.length < 2) throw new Error("Name each rate plan.");
    if (seen.has(name.toLowerCase())) throw new Error(`Two plans are called ${name}.`);
    seen.add(name.toLowerCase());
    if (p.adjust !== undefined && (!Number.isFinite(p.adjust) || Math.abs(p.adjust) > 100000))
      throw new Error(`${name}: check the amount.`);
    if (
      p.adjustPct !== undefined &&
      (!Number.isFinite(p.adjustPct) || p.adjustPct < -90 || p.adjustPct > 300)
    )
      throw new Error(`${name}: the percentage must be between −90 and 300.`);
    return {
      ...p,
      name,
      ...(p.channelRef?.trim() ? { channelRef: p.channelRef.trim().slice(0, 60) } : {}),
    };
  });
}

/** Restriction edits for a range of nights; undefined leaves a field as it is, null clears it. */
export interface RestrictionChange {
  minStay?: number | null;
  cta?: boolean;
  ctd?: boolean;
}

export function applyRestrictions(
  t: UnitType,
  from: IsoDate,
  to: IsoDate,
  change: RestrictionChange,
  weekdays?: number[],
): UnitType["calendar"] {
  const cal = { ...(t.calendar ?? {}) };
  if (
    change.minStay != null &&
    (!Number.isInteger(change.minStay) || change.minStay < 1 || change.minStay > 30)
  )
    throw new Error("Minimum stay is 1 to 30 nights.");
  for (let night = from; night <= to; night = addDays(night, 1)) {
    if (weekdays?.length && !weekdays.includes(new Date(`${night}T00:00:00Z`).getUTCDay()))
      continue;
    const next = { ...(cal[night] ?? {}) };
    if (change.minStay !== undefined) {
      if (change.minStay === null || change.minStay <= 1) delete next.minStay;
      else next.minStay = change.minStay;
    }
    if (change.cta !== undefined) {
      if (change.cta) next.cta = true;
      else delete next.cta;
    }
    if (change.ctd !== undefined) {
      if (change.ctd) next.ctd = true;
      else delete next.ctd;
    }
    if (Object.keys(next).length) cal[night] = next;
    else delete cal[night];
  }
  return cal;
}

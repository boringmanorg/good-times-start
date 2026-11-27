/**
 * Rates & availability (the YCS-style calendar): a nightly rate and an open/closed switch per
 * room type and night, over the type's base rate. Pure; saved through pms/actions.ts.
 */
import { addDays, daysBetween, nightsOf } from "./dates";
import { freeByNight } from "./inventory";
import type { IsoDate, NightPlan, Stay, Unit, UnitType } from "./types";

export const MAX_RATE_DAYS = 366;

export const rateOn = (t: UnitType, night: IsoDate): number => t.calendar?.[night]?.rate ?? t.rate;
export const closedOn = (t: UnitType, night: IsoDate): boolean =>
  t.calendar?.[night]?.closed === true;

/** Average nightly rate over a stay, rounded to the rupee: what a new booking line is quoted at. */
export function quoteRate(t: UnitType, checkIn: IsoDate, checkOut: IsoDate): number {
  const nights = nightsOf(checkIn, checkOut);
  if (!nights.length) return t.rate;
  return Math.round(nights.reduce((s, n) => s + rateOn(t, n), 0) / nights.length);
}

export interface GridCell {
  night: IsoDate;
  free: number;
  sold: number;
  rate: number;
  closed: boolean;
  changed: boolean;
  minStay?: number;
  cta?: boolean;
  ctd?: boolean;
}

/** One row of cells per room type for the calendar screen. */
export function rateGrid(
  types: UnitType[],
  units: Unit[],
  stays: Stay[],
  from: IsoDate,
  days: number,
): { type: UnitType; total: number; cells: GridCell[] }[] {
  const to = addDays(from, days);
  return types.map((t) => {
    const total = units.filter(
      (u) => u.typeId === t.id && !u.archived && u.housekeeping !== "out_of_order",
    ).length;
    const free = freeByNight(t, units, stays, from, to);
    return {
      type: t,
      total,
      cells: nightsOf(from, to).map((night) => {
        const f = Math.max(0, free.get(night) ?? 0);
        const plan = t.calendar?.[night];
        return {
          night,
          free: f,
          sold: total - f,
          rate: rateOn(t, night),
          closed: closedOn(t, night),
          changed: !!plan && (plan.rate !== undefined || plan.closed === true),
          ...(plan?.minStay ? { minStay: plan.minStay } : {}),
          ...(plan?.cta ? { cta: true } : {}),
          ...(plan?.ctd ? { ctd: true } : {}),
        };
      }),
    };
  });
}

/**
 * Apply one change to a range of nights (optionally only some weekdays, 0 = Sunday).
 * A rate equal to the base rate and an "open" night are stored as nothing, so the calendar only
 * keeps real changes. Returns the new calendar.
 */
export function applyRange(
  t: UnitType,
  from: IsoDate,
  to: IsoDate,
  change: { rate?: number | null; closed?: boolean },
  weekdays?: number[],
): Record<IsoDate, NightPlan> {
  const span = daysBetween(from, to);
  if (span < 0) throw new Error("The end date is before the start date.");
  if (span + 1 > MAX_RATE_DAYS) throw new Error(`Change up to ${MAX_RATE_DAYS} nights at a time.`);
  if (
    change.rate !== undefined &&
    change.rate !== null &&
    !(change.rate >= 0 && change.rate <= 500000)
  )
    throw new Error("Enter a rate.");
  const cal: Record<IsoDate, NightPlan> = { ...(t.calendar ?? {}) };
  for (let i = 0; i <= span; i++) {
    const night = addDays(from, i);
    if (weekdays?.length && !weekdays.includes(new Date(`${night}T00:00:00Z`).getUTCDay()))
      continue;
    const next: NightPlan = { ...(cal[night] ?? {}) };
    if (change.rate !== undefined) {
      if (change.rate === null || Math.round(change.rate * 100) / 100 === t.rate) delete next.rate;
      else next.rate = Math.round(change.rate * 100) / 100;
    }
    if (change.closed !== undefined) {
      if (change.closed) next.closed = true;
      else delete next.closed;
    }
    if (next.rate === undefined && !next.closed && !next.minStay && !next.cta && !next.ctd)
      delete cal[night];
    else cal[night] = next;
  }
  return cal;
}

/** Drop nights already past so the record doesn't grow forever. */
export function pruneCalendar(
  cal: Record<IsoDate, NightPlan> | undefined,
  today: IsoDate,
): Record<IsoDate, NightPlan> {
  const out: Record<IsoDate, NightPlan> = {};
  for (const [night, plan] of Object.entries(cal ?? {})) if (night >= today) out[night] = plan;
  return out;
}

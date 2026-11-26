/**
 * The restaurant's business day, used by every sales total: it opens at 6:00 am and runs until
 * 6:00 am the next morning, so a late night (last bills at 12:30–1 am, at most 3 am) stays with
 * the day it belongs to. A bill settled at 12:02 am on 26 Nov is a 25 Nov sale.
 *
 * Only the grouping changes: a bill keeps its real settlement time, receipt and audit log.
 * Purchases, expenses and the audit log stay on calendar dates. India has no daylight saving,
 * so a business day is always 24 hours.
 */
export const DAY_OPENS_HOUR = 6;
const OPENS_MS = DAY_OPENS_HOUR * 3_600_000;

/** 6:00 am of the business day `at` belongs to. */
export function businessDayStart(at: number): number {
  const d = new Date(at - OPENS_MS);
  d.setHours(DAY_OPENS_HOUR, 0, 0, 0);
  return d.getTime();
}

/** The business day as YYYY-MM-DD (the date it opened). */
export function businessDayKey(at: number): string {
  const d = new Date(at - OPENS_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** [opens, next opening) for a YYYY-MM-DD business date. */
export function businessDayBounds(date: string): [number, number] {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, DAY_OPENS_HOUR).getTime();
  return [start, nextBusinessDay(start)];
}

/** The opening after `start` (always the following day at 6:00 am). */
export function nextBusinessDay(start: number): number {
  return businessDayStart(start + 30 * 3_600_000);
}

/** The business date `offset` days from today's ("today" between midnight and 6 am is still yesterday). */
export function businessDateLabel(offset = 0, now = Date.now()): string {
  let at = businessDayStart(now);
  for (let i = 0; i < Math.abs(offset); i++) at = offset > 0 ? nextBusinessDay(at) : businessDayStart(at - 3_600_000);
  return businessDayKey(at);
}

/** 6:00 am on the 1st of the month the business day `at` falls in. */
export function businessMonthStart(at: number): number {
  const d = new Date(businessDayStart(at));
  return new Date(d.getFullYear(), d.getMonth(), 1, DAY_OPENS_HOUR).getTime();
}

/**
 * When a purchase or expense counts, by business day. A past-dated entry is stored at midnight of
 * its date (its time isn't known); midnight would fall in the day before, so it counts at noon.
 */
export function entryDayAt(at: number): number {
  const d = new Date(at);
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0 ? at + 12 * 3_600_000 : at;
}

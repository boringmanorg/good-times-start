import type { IsoDate } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (v: string): v is IsoDate => ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Days are counted in UTC on the date alone, so a time zone never shifts a night. */
export function addDays(d: IsoDate, n: number): IsoDate {
  const t = Date.parse(`${d}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The nights of a stay: check-in day up to the night before check-out. */
export function nightsOf(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
  const n = daysBetween(checkIn, checkOut);
  return n > 0 ? Array.from({ length: n }, (_, i) => addDays(checkIn, i)) : [];
}

/** Today at the property, in its own local time. */
export function localDate(at: number = Date.now()): IsoDate {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Thu 26 Nov" */
export function shortDay(d: IsoDate): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The Bookings list (YCS-style): search, filters and the money per booking. Pure.
 */
import { folioOf } from "./folio";
import type { IsoDate, Stay, StaySource, StayStatus, UnitType } from "./types";

export const SOURCE_LABEL: Record<StaySource, string> = { walk_in: "Walk-in", phone: "Phone / WhatsApp", website: "Website", ota: "Booking site" };
export const STATUS_LABEL: Record<StayStatus, string> = { booked: "Confirmed", checked_in: "In house", checked_out: "Checked out", cancelled: "Cancelled", no_show: "No-show" };

export interface BookingFilter { query: string; status: StayStatus | "all"; source: StaySource | "all"; from?: IsoDate; to?: IsoDate }

export function bookingMatches(s: Stay, f: BookingFilter): boolean {
  if (f.status !== "all" && s.status !== f.status) return false;
  if (f.source !== "all" && s.source !== f.source) return false;
  // Date range on the stay's nights: arrives before `to` and leaves after `from`.
  if (f.from && s.checkOut <= f.from) return false;
  if (f.to && s.checkIn > f.to) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return [s.guest.name, s.reference, s.ota?.bookingId ?? "", s.ota?.name ?? ""].some((v) => v.toLowerCase().includes(q))
    || (digits.length >= 4 && s.guest.phone.replace(/\D/g, "").includes(digits));
}

/** Newest arrival first, then by name. */
export function sortBookings(list: Stay[]): Stay[] {
  return [...list].sort((a, b) => b.checkIn.localeCompare(a.checkIn) || a.guest.name.localeCompare(b.guest.name));
}

export interface SourceRow { source: StaySource; bookings: number; nights: number; revenue: number }

/** Room revenue (before GST) and room-nights per channel, for stays touching the window. */
export function bySource(stays: Stay[], types: UnitType[], from: IsoDate, to: IsoDate): SourceRow[] {
  const rows = new Map<StaySource, SourceRow>();
  for (const s of stays) {
    if (s.status === "cancelled" || s.checkOut <= from || s.checkIn >= to) continue;
    const f = folioOf({ ...s, charges: [], payments: [] }, types);
    const row = rows.get(s.source) ?? { source: s.source, bookings: 0, nights: 0, revenue: 0 };
    row.bookings += 1;
    row.nights += s.lines.reduce((n, l) => n + l.units, 0) * f.nights;
    row.revenue += f.taxable;
    rows.set(s.source, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

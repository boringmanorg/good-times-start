/**
 * The stay's bill (folio): room nights with stay GST, extras, payments and what is still due.
 * Stay GST since 22 Sep 2025, per unit per night: nil up to ₹1,000, 5% (no ITC) up to ₹7,500,
 * 18% above. The slab follows the highest night's rate when rates vary.
 */
import { nightsOf } from "./dates";
import type { Stay, StayGstSlab, UnitType } from "./types";

export const STAY_GST_NIL_UPTO = 1000;
export const STAY_GST_LOW_UPTO = 7500;

export function stayGstPct(rate: number, slab: StayGstSlab = "auto"): number {
  if (slab !== "auto") return Number(slab);
  if (rate <= STAY_GST_NIL_UPTO) return 0;
  return rate <= STAY_GST_LOW_UPTO ? 5 : 18;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface FolioLine { label: string; taxable: number; gstPct: number; gst: number; kind: "room" | "charge" }

export interface Folio {
  nights: number;
  lines: FolioLine[];
  taxable: number;
  gst: number;
  total: number;
  paid: number;
  refunded: number;
  /** total − (paid − refunded); negative means the guest is owed money back. */
  due: number;
}

export function folioOf(stay: Pick<Stay, "checkIn" | "checkOut" | "lines" | "charges" | "payments">, types: UnitType[]): Folio {
  const nights = nightsOf(stay.checkIn, stay.checkOut).length;
  const lines: FolioLine[] = [];
  for (const l of stay.lines) {
    const type = types.find((t) => t.id === l.typeId);
    const taxable = r2(l.rate * l.units * nights);
    const gstPct = stayGstPct(l.rate, type?.gst);
    const what = type ? type.name : "Room";
    const unit = type?.soldAs === "bed" ? (l.units === 1 ? "bed" : "beds") : (l.units === 1 ? "room" : "rooms");
    lines.push({ kind: "room", label: `${what} · ${l.units} ${unit} × ${nights} night${nights === 1 ? "" : "s"}`, taxable, gstPct, gst: r2(taxable * gstPct / 100) });
  }
  for (const c of stay.charges) lines.push({ kind: "charge", label: c.label, taxable: r2(c.amount), gstPct: c.gstPct, gst: r2(c.amount * c.gstPct / 100) });
  const taxable = r2(lines.reduce((s, l) => s + l.taxable, 0));
  const gst = r2(lines.reduce((s, l) => s + l.gst, 0));
  const total = Math.round(taxable + gst);
  const paid = r2(stay.payments.filter((p) => p.kind !== "refund").reduce((s, p) => s + p.amount, 0));
  const refunded = r2(stay.payments.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amount, 0));
  return { nights, lines, taxable, gst, total, paid, refunded, due: r2(total - (paid - refunded)) };
}

/** The advance that confirms a booking (XTSY: 25%), rounded up to the rupee. */
export function advanceFor(total: number, pct = 25): number {
  return Math.ceil(total * pct / 100);
}

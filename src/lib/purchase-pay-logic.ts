/**
 * How a purchase was paid: one or more payment lines (split), plus an optional
 * round-off. No bank accounts are kept — only the method and the amount.
 *
 * Paid total = items total + roundOff. A round-off is held to ±₹100, the same
 * limit as at the billing counter.
 */
import type { StockEntry } from "./types";

export type PurchasePayMode = "cash" | "upi" | "card" | "bank" | "credit";
export interface PurchasePayment { mode: PurchasePayMode; amount: number }

export const PURCHASE_PAY_MODES: { v: PurchasePayMode; l: string; short: string }[] = [
  { v: "cash", l: "Cash", short: "Cash" },
  { v: "upi", l: "UPI", short: "UPI" },
  { v: "card", l: "Card", short: "Card" },
  { v: "bank", l: "Bank transfer", short: "Bank" },
  { v: "credit", l: "Pay later (credit)", short: "Pay later" },
];
export const PURCHASE_MAX_ROUND_OFF = 100;

const r2 = (n: number) => Math.round(n * 100) / 100;

export const payModeLabel = (m: PurchasePayMode) => PURCHASE_PAY_MODES.find((p) => p.v === m)?.l ?? m;

/** Items total of a purchase (before round-off), from its lines. */
export function itemsTotal(items: StockEntry["items"]): number {
  return r2(items.reduce((n, i) => n + Math.abs(i.qty) * (i.unitCost ?? 0), 0));
}

/** What the purchase came to after round-off: what was (or will be) paid. */
export function purchasePayable(entry: Pick<StockEntry, "items" | "roundOff">): number {
  return r2(itemsTotal(entry.items) + (entry.roundOff ?? 0));
}

/** Why these payments don't settle the purchase, or null if they do. */
export function purchasePayProblem(total: number, payments: PurchasePayment[], roundOff = 0): string | null {
  if (Math.abs(roundOff) > PURCHASE_MAX_ROUND_OFF) return `Round-off can't be more than ₹${PURCHASE_MAX_ROUND_OFF} either way`;
  if (!payments.length) return "Add how this purchase was paid";
  if (payments.some((p) => !PURCHASE_PAY_MODES.some((m) => m.v === p.mode))) return "Choose a payment method";
  if (payments.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) return "Each payment needs an amount above zero";
  const due = r2(total + roundOff);
  const paid = r2(payments.reduce((n, p) => n + p.amount, 0));
  if (paid < due) return `₹${r2(due - paid).toLocaleString("en-IN")} still to account for`;
  if (paid > due) return `Payments are ₹${r2(paid - due).toLocaleString("en-IN")} more than the bill`;
  return null;
}

/**
 * Round the purchase to what was actually paid, when the gap is small
 * (₹1,248.60 bill paid as ₹1,249). Null when nothing to round or the gap is too big.
 */
export function purchaseRoundOffOffer(total: number, payments: PurchasePayment[]): number | null {
  const paid = r2(payments.reduce((n, p) => n + (Number.isFinite(p.amount) && p.amount > 0 ? p.amount : 0), 0));
  if (paid <= 0) return null;
  const roundOff = r2(paid - total);
  if (roundOff === 0 || Math.abs(roundOff) > PURCHASE_MAX_ROUND_OFF) return null;
  return roundOff;
}

/** "UPI ₹500 + Pay later ₹748" — or "Payment not recorded" for older purchases. */
export function paymentText(entry: Pick<StockEntry, "payments">): string {
  if (!entry.payments?.length) return "Payment not recorded";
  return entry.payments.map((p) => `${PURCHASE_PAY_MODES.find((m) => m.v === p.mode)?.short ?? p.mode} ₹${p.amount.toLocaleString("en-IN")}`).join(" + ");
}

/** Spend split by how it was paid. Purchases recorded before payment methods existed count as "unrecorded". */
export function spendByMode(entries: StockEntry[]): { mode: PurchasePayMode | "unrecorded"; amount: number }[] {
  const totals = new Map<PurchasePayMode | "unrecorded", number>();
  for (const e of entries) {
    if (e.type !== "purchase") continue;
    if (e.payments?.length) for (const p of e.payments) totals.set(p.mode, r2((totals.get(p.mode) ?? 0) + p.amount));
    else totals.set("unrecorded", r2((totals.get("unrecorded") ?? 0) + purchasePayable(e)));
  }
  const order: (PurchasePayMode | "unrecorded")[] = [...PURCHASE_PAY_MODES.map((m) => m.v), "unrecorded"];
  return order.filter((m) => (totals.get(m) ?? 0) !== 0).map((mode) => ({ mode, amount: totals.get(mode) ?? 0 }));
}

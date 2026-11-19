/**
 * Correcting a settled bill (owner/manager only, with a reason, within 48 hours).
 *
 * For a mismatch found after settlement: the wrong payment mode, the wrong split,
 * a missed discount, or a bill closed as NC that was actually paid. The items and
 * the bill number never change; neither does the settlement time. Each correction
 * is kept on the bill (`amendments`) with who, when, why, and the before/after.
 *
 * The cloud enforces the same rules (guard_settled_bill_amendment), so a device
 * with an old app or a wrong clock can't widen them.
 */
import { computeTotals, settledValueProblem } from "./billing";
import { withManualRoundOff } from "./payment-logic";
import type { Order, PaymentMode } from "./types";

export const AMEND_WINDOW_MS = 48 * 3_600_000;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
/** Linked to a card balance or a guest's points elsewhere: not corrected from here. */
const LOCKED_MODES: PaymentMode[] = ["gift_card", "points"];

export interface AmendSnapshot {
  discountPct: number; discountAmt: number; taxable: number; cgst: number; sgst: number;
  serviceCharge: number; roundOff: number; total: number; payments: Order["payments"];
}
export interface Amendment { at: number; by: string; reason: string; from: AmendSnapshot; to: AmendSnapshot }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** When the 48 hours started: the first settlement, never a later correction. */
export function firstSettledAt(order: Pick<Order, "settledAt" | "originalSettledAt">): number | null {
  return order.originalSettledAt ?? order.settledAt ?? null;
}

export function amendDeadline(order: Pick<Order, "settledAt" | "originalSettledAt">): number | null {
  const first = firstSettledAt(order);
  return first === null ? null : first + AMEND_WINDOW_MS;
}

/** Why this bill can't be corrected now, or null if it can. */
export function amendBlocked(order: Order, isAdmin: boolean, now: number): string | null {
  if (order.status !== "settled") return "Only settled bills can be corrected";
  if (!isAdmin) return "Only the owner or a manager can correct a settled bill";
  const deadline = amendDeadline(order);
  if (deadline === null) return "This bill has no settlement time";
  if (now > deadline) return "Settled bills can be corrected only within 48 hours";
  if (order.payments.some((p) => LOCKED_MODES.includes(p.mode))) return "Bills paid by gift card or loyalty points can't be corrected here";
  return null;
}

export const AMEND_MODES: PaymentMode[] = ["cash", "upi", "card", "wallet", "credit"];

function snapshot(o: Pick<Order, keyof AmendSnapshot>): AmendSnapshot {
  return {
    discountPct: o.discountPct, discountAmt: o.discountAmt, taxable: o.taxable ?? 0, cgst: o.cgst, sgst: o.sgst,
    serviceCharge: o.serviceCharge ?? 0, roundOff: o.roundOff, total: o.total, payments: o.payments,
  };
}

/** The total the corrected bill comes to before any round-off the admin picks. */
export function amendTotals(order: Order, discountPct: number) {
  return computeTotals(order.lines, discountPct, order.serviceChargePct ?? 0, order.tax ?? {});
}

/**
 * The corrected bill, or the reason it can't be saved. `payTotal` is what the
 * guest actually paid when it differs from the bill (the difference becomes
 * round-off, held to ±₹100 like at the counter).
 */
export function amendedBill(order: Order, change: { discountPct: number; payments: Order["payments"]; payTotal?: number | null; reason: string },
  by: string, isAdmin: boolean, now: number): Order | string {
  const blocked = amendBlocked(order, isAdmin, now);
  if (blocked) return blocked;
  const reason = change.reason.trim();
  if (reason.length < REASON_MIN) return "Write the reason for the correction";
  if (reason.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters`;
  if (!Number.isFinite(change.discountPct) || change.discountPct < 0 || change.discountPct > 100) return "Discount must be between 0 and 100%";

  let t: ReturnType<typeof amendTotals> = amendTotals(order, change.discountPct);
  if (change.payTotal != null && Math.abs(change.payTotal - t.total) > 0.005) {
    const rounded = withManualRoundOff(t, t.total, change.payTotal);
    if (typeof rounded === "string") return rounded;
    t = rounded;
  }
  const valueProblem = settledValueProblem(t);
  if (valueProblem) return valueProblem;

  const payments = change.payments.filter((p) => p.amount !== 0).map((p) => ({ mode: p.mode, amount: r2(p.amount) }));
  if (payments.some((p) => !AMEND_MODES.includes(p.mode))) return "Gift cards and loyalty points can't be added in a correction";
  if (payments.some((p) => !Number.isFinite(p.amount) || p.amount < 0)) return "Every payment needs an amount above zero";
  const paid = r2(payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - t.total) > 0.005) {
    return paid < t.total ? `Payments are ₹${r2(t.total - paid)} short of the bill` : `Payments are ₹${r2(paid - t.total)} more than the bill`;
  }

  const from = snapshot(order);
  const to: AmendSnapshot = {
    discountPct: change.discountPct, discountAmt: t.discountAmt, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst,
    serviceCharge: t.serviceCharge, roundOff: t.roundOff, total: t.total, payments,
  };
  if (JSON.stringify(from) === JSON.stringify(to)) return "Nothing has changed";

  return {
    ...order, ...to,
    originalSettledAt: firstSettledAt(order) ?? undefined,
    amendments: [...(order.amendments ?? []), { at: now, by, reason, from, to }],
    synced: false,
  };
}

/** "Cash ₹1,163 → UPI ₹663 + Cash ₹500", for history and the audit trail. */
export function paymentsText(payments: Order["payments"], label: (m: PaymentMode) => string): string {
  if (!payments.length) return "No payment (NC)";
  return payments.map((p) => `${label(p.mode)} ₹${p.amount.toLocaleString("en-IN")}`).join(" + ");
}

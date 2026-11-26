/**
 * Money that isn't a bill or a purchase: paying a vendor what was bought on "Pay later",
 * expenses (rent, salaries, gas…) and other income. Plus the books built from everything the
 * POS already knows: profit & loss, money in and out by mode (cash book / bank book), and a
 * day book. Pure, tested in ledger-logic.test.ts.
 *
 * Ledger entries are append-only. A mistake is voided with a reason (kept, crossed out), never
 * edited or deleted — the cloud enforces the same (docs/migrations/2026-11-20-ledger.sql).
 */
import { approvalStatus, entryAmount, purchaseTime } from "./purchase-logic";
import { entryDayAt } from "./business-day";
import type { LedgerEntry, LedgerMode, Order, StockEntry } from "./types";

export type { LedgerEntry, LedgerMode };
export const LEDGER_MODES: { v: LedgerMode; l: string }[] = [
  { v: "cash", l: "Cash" }, { v: "upi", l: "UPI" }, { v: "card", l: "Card" }, { v: "bank", l: "Bank transfer" },
];
export const EXPENSE_CATEGORIES: { v: string; l: string }[] = [
  { v: "rent", l: "Rent" }, { v: "salaries", l: "Salaries & wages" }, { v: "utilities", l: "Electricity & water" },
  { v: "gas", l: "Gas & fuel" }, { v: "repairs", l: "Repairs & maintenance" }, { v: "marketing", l: "Marketing" },
  { v: "licences", l: "Licences & fees" }, { v: "delivery", l: "Delivery & commission" }, { v: "supplies", l: "Cleaning & small supplies" },
  { v: "other", l: "Other" },
];
export const INCOME_CATEGORIES: { v: string; l: string }[] = [
  { v: "other_income", l: "Other income" }, { v: "owner_capital", l: "Owner put money in" },
];
export const categoryLabel = (v: string | undefined) =>
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.v === v)?.l ?? (v ? v.replace(/_/g, " ") : "");
export const modeLabel = (m: string) => LEDGER_MODES.find((x) => x.v === m)?.l ?? (m === "credit" ? "Pay later" : m === "wallet" ? "Wallet, Swiggy & Zomato" : m);

const r2 = (n: number) => Math.round(n * 100) / 100;
export const isLive = (e: LedgerEntry) => !e.void;

/** Why an entry can't be saved, or null. */
export function ledgerProblem(e: Pick<LedgerEntry, "type" | "amount" | "mode" | "at" | "category" | "supplierId" | "allocations">, now = Date.now()): string | null {
  if (!Number.isFinite(e.amount) || e.amount <= 0) return "Enter an amount above ₹0";
  if (e.amount > 10_000_000) return "That amount looks too large";
  if (!LEDGER_MODES.some((m) => m.v === e.mode)) return "Choose how it was paid";
  if (!Number.isFinite(e.at) || e.at > now + 60_000) return "The date can't be in the future";
  if (e.type === "expense" && !EXPENSE_CATEGORIES.some((c) => c.v === e.category)) return "Choose what the expense was for";
  if (e.type === "income" && !INCOME_CATEGORIES.some((c) => c.v === e.category)) return "Choose what the money was";
  if (e.type === "vendor_payment") {
    if (!e.supplierId) return "Choose the vendor";
    const allocated = r2((e.allocations ?? []).reduce((n, a) => n + a.amount, 0));
    if ((e.allocations ?? []).some((a) => !(a.amount > 0))) return "Each bill needs an amount above ₹0";
    if (allocated > r2(e.amount) + 0.001) return "More is set against bills than was paid";
  }
  return null;
}

/** The "Pay later" part of a purchase. */
export function purchaseCredit(p: StockEntry): number {
  return r2((p.payments ?? []).filter((x) => x.mode === "credit").reduce((n, x) => n + x.amount, 0));
}

export interface OwedBill { purchase: StockEntry; credit: number; returned: number; paid: number; owed: number }

/**
 * What is still owed on each approved purchase that had a "Pay later" part: the credit, less
 * approved supplier returns against it (up to the credit), less vendor payments set against it.
 */
export function owedBills(entries: StockEntry[], ledger: LedgerEntry[]): OwedBill[] {
  const returns = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== "return" || !e.purchaseId || approvalStatus(e) !== "approved") continue;
    returns.set(e.purchaseId, r2((returns.get(e.purchaseId) ?? 0) + Math.abs(entryAmount(e))));
  }
  const paid = new Map<string, number>();
  for (const l of ledger) {
    if (l.type !== "vendor_payment" || !isLive(l)) continue;
    for (const a of l.allocations ?? []) paid.set(a.purchaseId, r2((paid.get(a.purchaseId) ?? 0) + a.amount));
  }
  return entries
    .filter((p) => p.type === "purchase" && approvalStatus(p) === "approved" && purchaseCredit(p) > 0)
    .map((purchase) => {
      const credit = purchaseCredit(purchase);
      const returned = Math.min(credit, returns.get(purchase.id) ?? 0);
      const done = paid.get(purchase.id) ?? 0;
      return { purchase, credit, returned, paid: done, owed: r2(Math.max(0, credit - returned - done)) };
    })
    .sort((a, b) => a.purchase.at - b.purchase.at);
}

export interface VendorOwed { supplierId: string; name: string; owed: number; bills: OwedBill[]; unallocated: number; oldestAt: number | null }

/** Per vendor: what's owed (oldest bill first) and any payment not yet set against a bill. */
export function vendorPayables(entries: StockEntry[], ledger: LedgerEntry[], suppliers: { id: string; name: string }[]): VendorOwed[] {
  const bills = owedBills(entries, ledger);
  const byVendor = new Map<string, VendorOwed>();
  const nameOf = (id: string, fallback?: string) => suppliers.find((s) => s.id === id)?.name ?? fallback ?? "Vendor";
  for (const b of bills) {
    const id = b.purchase.supplierId ?? "unknown";
    const v = byVendor.get(id) ?? { supplierId: id, name: nameOf(id, b.purchase.supplierName), owed: 0, bills: [], unallocated: 0, oldestAt: null };
    v.bills.push(b);
    v.owed = r2(v.owed + b.owed);
    if (b.owed > 0 && (v.oldestAt === null || b.purchase.at < v.oldestAt)) v.oldestAt = b.purchase.at;
    byVendor.set(id, v);
  }
  for (const l of ledger) {
    if (l.type !== "vendor_payment" || !isLive(l) || !l.supplierId) continue;
    const left = r2(l.amount - (l.allocations ?? []).reduce((n, a) => n + a.amount, 0));
    if (left <= 0) continue;
    const v = byVendor.get(l.supplierId) ?? { supplierId: l.supplierId, name: nameOf(l.supplierId, l.supplierName), owed: 0, bills: [], unallocated: 0, oldestAt: null };
    v.unallocated = r2(v.unallocated + left);
    byVendor.set(l.supplierId, v);
  }
  return [...byVendor.values()].filter((v) => v.owed > 0 || v.unallocated > 0).sort((a, b) => b.owed - a.owed);
}

/** Set a payment against the oldest bills first. Anything left over stays as an advance. */
export function allocateOldestFirst(bills: OwedBill[], amount: number): { purchaseId: string; amount: number }[] {
  let left = r2(amount);
  const out: { purchaseId: string; amount: number }[] = [];
  for (const b of [...bills].sort((x, y) => x.purchase.at - y.purchase.at)) {
    if (left <= 0) break;
    if (b.owed <= 0) continue;
    const take = r2(Math.min(left, b.owed));
    out.push({ purchaseId: b.purchase.id, amount: take });
    left = r2(left - take);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* The books                                                                                   */

const soldAt = (o: Order) => o.settledAt ?? o.createdAt;
const inRange = (t: number, from: number, to: number) => t >= from && t < to;

export interface ProfitAndLoss {
  sales: number; gst: number; bills: number; ncBills: number;
  purchases: number; returns: number; netPurchases: number;
  expenses: number; expensesByCategory: { category: string; amount: number }[];
  grossProfit: number; operatingProfit: number; otherIncome: number;
}

/**
 * Profit & loss for [from, to). Sales are settled bills before GST (the GST belongs to the
 * government); purchases are approved bills less returns, at what was paid; expenses and other
 * income come from the ledger. Owner's capital is money in, not income, so it is left out.
 */
export function profitAndLoss(orders: Order[], entries: StockEntry[], ledger: LedgerEntry[], from: number, to: number): ProfitAndLoss {
  const settled = orders.filter((o) => o.status === "settled" && inRange(soldAt(o), from, to));
  const gstOf = (o: Order) => r2((o.cgst ?? 0) + (o.sgst ?? 0) + ((o as { igst?: number }).igst ?? 0));
  const sales = r2(settled.reduce((n, o) => n + (o.total - gstOf(o)), 0));
  const gst = r2(settled.reduce((n, o) => n + gstOf(o), 0));
  const counted = entries.filter((e) => approvalStatus(e) === "approved" && inRange(entryDayAt(e.at), from, to));
  const purchases = r2(counted.filter((e) => e.type === "purchase").reduce((n, e) => n + entryAmount(e), 0));
  const returns = r2(-counted.filter((e) => e.type === "return").reduce((n, e) => n + entryAmount(e), 0));
  const live = ledger.filter((l) => isLive(l) && inRange(l.at, from, to));
  const byCat = new Map<string, number>();
  for (const l of live.filter((x) => x.type === "expense")) byCat.set(l.category ?? "other", r2((byCat.get(l.category ?? "other") ?? 0) + l.amount));
  const expenses = r2([...byCat.values()].reduce((n, v) => n + v, 0));
  const otherIncome = r2(live.filter((l) => l.type === "income" && l.category === "other_income").reduce((n, l) => n + l.amount, 0));
  const netPurchases = r2(purchases - returns);
  const grossProfit = r2(sales - netPurchases);
  return {
    sales, gst, bills: settled.length, ncBills: settled.filter((o) => !o.payments.length).length,
    purchases, returns, netPurchases, expenses,
    expensesByCategory: [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    grossProfit, operatingProfit: r2(grossProfit - expenses + otherIncome), otherIncome,
  };
}

export interface ModeFlow { mode: string; moneyIn: number; moneyOut: number; net: number }

/**
 * Money in and out by how it moved, for [from, to): the cash book and the bank book in one
 * table. In: bill payments, other income, owner's capital. Out: purchases paid on the spot,
 * vendor payments, expenses. "Pay later" moves no money until it's paid; loyalty points and
 * gift cards aren't money either.
 */
export function moneyFlow(orders: Order[], entries: StockEntry[], ledger: LedgerEntry[], from: number, to: number): ModeFlow[] {
  const flow = new Map<string, { moneyIn: number; moneyOut: number }>();
  const add = (mode: string, field: "moneyIn" | "moneyOut", amount: number) => {
    const cur = flow.get(mode) ?? { moneyIn: 0, moneyOut: 0 };
    cur[field] = r2(cur[field] + amount);
    flow.set(mode, cur);
  };
  for (const o of orders) {
    if (o.status !== "settled" || !inRange(soldAt(o), from, to)) continue;
    for (const p of o.payments) if (p.mode !== "points" && p.mode !== "gift_card" && p.mode !== "credit") add(p.mode, "moneyIn", p.amount);
  }
  for (const e of entries) {
    if (e.type !== "purchase" || approvalStatus(e) !== "approved" || !inRange(entryDayAt(e.at), from, to)) continue;
    for (const p of e.payments ?? []) if (p.mode !== "credit") add(p.mode, "moneyOut", p.amount);
  }
  for (const l of ledger) {
    if (!isLive(l) || !inRange(l.at, from, to)) continue;
    add(l.mode, l.type === "income" ? "moneyIn" : "moneyOut", l.amount);
  }
  const order = ["cash", "upi", "card", "bank", "wallet"];
  return [...flow].map(([mode, v]) => ({ mode, ...v, net: r2(v.moneyIn - v.moneyOut) }))
    .sort((a, b) => (order.indexOf(a.mode) + 99 * Number(!order.includes(a.mode))) - (order.indexOf(b.mode) + 99 * Number(!order.includes(b.mode))));
}

export interface DayBookLine { at: number; kind: "sale" | "purchase" | "return" | "vendor_payment" | "expense" | "income"; title: string; mode: string; moneyIn: number; moneyOut: number; voided?: boolean; id: string; /** The time of day isn't known (a past-dated entry): show the date only. */ dateOnly?: boolean }

/** Every money movement in [from, to), newest first: the day book. */
export function dayBook(orders: Order[], entries: StockEntry[], ledger: LedgerEntry[], from: number, to: number, supplierName: (id?: string) => string): DayBookLine[] {
  const out: DayBookLine[] = [];
  for (const o of orders) {
    if (o.status !== "settled" || !inRange(soldAt(o), from, to)) continue;
    const modes = o.payments.map((p) => modeLabel(p.mode)).join(" + ") || "NC";
    out.push({ id: `o:${o.uid ?? o.id}`, at: soldAt(o), kind: "sale", title: `Bill ${o.billNo || ""}`.trim(), mode: modes, moneyIn: o.payments.filter((p) => p.mode !== "points" && p.mode !== "gift_card").reduce((n, p) => n + p.amount, 0), moneyOut: 0 });
  }
  for (const e of entries) {
    if (approvalStatus(e) !== "approved" || !inRange(entryDayAt(e.at), from, to) || (e.type !== "purchase" && e.type !== "return")) continue;
    const name = supplierName(e.supplierId) || e.supplierName || "Vendor";
    if (e.type === "purchase") {
      const now = (e.payments ?? []).filter((p) => p.mode !== "credit");
      const credit = purchaseCredit(e);
      const clock = purchaseTime(e);
      out.push({ id: `p:${e.id}`, at: clock ?? e.at, ...(clock === null ? { dateOnly: true } : {}), kind: "purchase", title: `Purchase · ${name}${e.reference ? ` #${e.reference}` : ""}${credit ? ` · ₹${credit.toLocaleString("en-IN")} on pay later` : ""}`,
        mode: now.map((p) => modeLabel(p.mode)).join(" + ") || (credit ? "Pay later" : "Not recorded"), moneyIn: 0, moneyOut: r2(now.reduce((n, p) => n + p.amount, 0)) });
    } else {
      const clock = purchaseTime(e);
      out.push({ id: `r:${e.id}`, at: clock ?? e.at, ...(clock === null ? { dateOnly: true } : {}), kind: "return", title: `Return to ${name} · ₹${Math.abs(entryAmount(e)).toLocaleString("en-IN")} off the bill`, mode: "—", moneyIn: 0, moneyOut: 0 });
    }
  }
  for (const l of ledger) {
    if (!inRange(l.at, from, to)) continue;
    const title = l.type === "vendor_payment" ? `Paid ${supplierName(l.supplierId) || l.supplierName || "vendor"}` : l.type === "expense" ? categoryLabel(l.category) : categoryLabel(l.category);
    const clock = purchaseTime({ at: l.at, recordedAt: l.recordedAt });
    out.push({ id: `l:${l.id}`, at: clock ?? l.at, ...(clock === null ? { dateOnly: true } : {}), kind: l.type, title: `${title}${l.note ? ` · ${l.note}` : ""}`, mode: modeLabel(l.mode),
      moneyIn: l.type === "income" ? l.amount : 0, moneyOut: l.type === "income" ? 0 : l.amount, ...(l.void ? { voided: true } : {}) });
  }
  return out.sort((a, b) => b.at - a.at);
}

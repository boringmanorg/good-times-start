import type { Material, StockEntry } from "./types";

export const PURCHASE_RETURN_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Approved, waiting, or rejected. Entries an admin recorded directly have no approval and count as approved. */
export function approvalStatus(entry: Pick<StockEntry, "approval">): "approved" | "pending" | "rejected" {
  return entry.approval?.status ?? "approved";
}
/** Only approved purchases and returns count in history, totals and vendor amounts. */
export const counts = (entry: Pick<StockEntry, "approval">) => approvalStatus(entry) === "approved";

export function canReturnPurchase(purchase: StockEntry, now = Date.now()): boolean {
  return purchase.type === "purchase" && counts(purchase) && now >= purchase.at && now <= purchase.at + PURCHASE_RETURN_WINDOW_MS;
}

export function remainingPurchaseQty(purchase: StockEntry, returns: StockEntry[], materialId: string): number {
  const bought = purchase.items.filter((i) => i.materialId === materialId).reduce((n, i) => n + i.qty, 0);
  // Returns still waiting for approval count too, so two requests can't over-return; rejected ones don't.
  const returned = returns.filter((e) => e.purchaseId === purchase.id && approvalStatus(e) !== "rejected").flatMap((e) => e.items)
    .filter((i) => i.materialId === materialId).reduce((n, i) => n + Math.abs(i.qty), 0);
  return Math.max(0, Math.round((bought - returned) * 1000) / 1000);
}

export function validatePurchaseReturn(purchase: StockEntry, returns: StockEntry[], items: StockEntry["items"], now = Date.now()): void {
  if (!canReturnPurchase(purchase, now)) throw new Error("Supplier returns are available only within 48 hours of purchase.");
  if (!items.length) throw new Error("Select an item to return.");
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.materialId) || !Number.isFinite(item.qty) || item.qty >= 0 ||
      Math.abs(item.qty) > remainingPurchaseQty(purchase, returns, item.materialId)) {
      throw new Error("Return quantity must not exceed the remaining purchased quantity.");
    }
    seen.add(item.materialId);
  }
}

export function purchaseItemSummary(material: Material, purchases: StockEntry[]) {
  const visits = purchases.filter((p) => p.type === "purchase" && p.items.some((i) => i.materialId === material.id)).sort((a, b) => b.at - a.at);
  const last = visits[0];
  const first = visits[visits.length - 1];
  const lines = last?.items.filter((i) => i.materialId === material.id) ?? [];
  const qty = lines.reduce((n, i) => n + i.qty, 0);
  const amount = lines.reduce((n, i) => n + i.qty * (i.unitCost ?? 0), 0);
  return {
    count: visits.length, lastAt: last?.at, lastQty: last ? qty : undefined,
    lastPrice: last && lines.every((i) => i.unitCost !== undefined) && qty > 0 ? amount / qty : undefined,
    averageDays: visits.length > 1 && last && first ? (last.at - first.at) / ((visits.length - 1) * 86400000) : undefined,
  };
}
/* ---- Purchase history views ---- */

export interface PurchaseLineView { entryId: string; at: number; kind: "purchase" | "return"; supplier: string; invoice: string; qty: number; unitCost: number; amount: number }

/** Signed amount of an entry: purchases add, supplier returns subtract. */
export function entryAmount(entry: StockEntry): number {
  const sign = entry.type === "return" ? -1 : 1;
  return Math.round(sign * entry.items.reduce((n, i) => n + Math.abs(i.qty) * (i.unitCost ?? 0), 0) * 100) / 100;
}

function supplierLabel(entry: StockEntry, suppliers: { id: string; name: string }[], purchases?: StockEntry[]): string {
  const original = entry.purchaseId ? purchases?.find((p) => p.id === entry.purchaseId) : undefined;
  const id = entry.supplierId ?? original?.supplierId;
  return entry.supplierName || original?.supplierName || suppliers.find((s) => s.id === id)?.name || "Supplier not recorded";
}

/** Every purchase and return of one item, newest first. */
export function itemPurchaseLines(materialId: string, entries: StockEntry[], suppliers: { id: string; name: string }[]): PurchaseLineView[] {
  return entries.filter((e) => counts(e) && (e.type === "purchase" || (e.type === "return" && e.purchaseId)))
    .flatMap((e) => e.items.filter((i) => i.materialId === materialId).map((i) => {
      const kind = e.type === "return" ? "return" as const : "purchase" as const;
      const qty = Math.abs(i.qty);
      const unitCost = i.unitCost ?? 0;
      return { entryId: e.id, at: e.at, kind, supplier: supplierLabel(e, suppliers, entries), invoice: e.reference ?? "", qty, unitCost, amount: Math.round((kind === "return" ? -1 : 1) * qty * unitCost * 100) / 100 };
    }))
    .sort((a, b) => b.at - a.at);
}

/** Totals bought (net of returns) for one item. */
export function itemTotals(lines: PurchaseLineView[]): { qty: number; amount: number; bills: number } {
  const qty = lines.reduce((n, l) => n + (l.kind === "return" ? -l.qty : l.qty), 0);
  const amount = lines.reduce((n, l) => n + l.amount, 0);
  return { qty: Math.round(qty * 1000) / 1000, amount: Math.round(amount * 100) / 100, bills: new Set(lines.filter((l) => l.kind === "purchase").map((l) => l.entryId)).size };
}

export interface SupplierDay { day: string; at: number; amount: number; entries: StockEntry[] }
export interface SupplierHistory { key: string; name: string; amount: number; bills: number; returns: number; lastAt: number; days: SupplierDay[] }

function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Purchase amounts per vendor (net of returns), each split into days, newest first. */
export function supplierHistories(entries: StockEntry[], suppliers: { id: string; name: string }[]): SupplierHistory[] {
  const relevant = entries.filter((e) => counts(e) && (e.type === "purchase" || (e.type === "return" && e.purchaseId)));
  const groups = new Map<string, SupplierHistory>();
  for (const e of relevant) {
    const original = e.purchaseId ? relevant.find((p) => p.id === e.purchaseId) : undefined;
    const key = e.supplierId ?? original?.supplierId ?? `name:${supplierLabel(e, suppliers, relevant)}`;
    const g = groups.get(key) ?? { key, name: supplierLabel(e, suppliers, relevant), amount: 0, bills: 0, returns: 0, lastAt: 0, days: [] };
    g.amount = Math.round((g.amount + entryAmount(e)) * 100) / 100;
    if (e.type === "purchase") g.bills += 1; else g.returns += 1;
    g.lastAt = Math.max(g.lastAt, e.at);
    const day = localDay(e.at);
    let d = g.days.find((x) => x.day === day);
    if (!d) { d = { day, at: e.at, amount: 0, entries: [] }; g.days.push(d); }
    d.amount = Math.round((d.amount + entryAmount(e)) * 100) / 100;
    d.at = Math.max(d.at, e.at);
    d.entries.push(e);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.days.sort((a, b) => b.at - a.at);
    for (const d of g.days) d.entries.sort((a, b) => b.at - a.at);
  }
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/** Recorded by this login (the bill desk shares one login across its terminals). */
export function requestedByMe(entry: Pick<StockEntry, "approval">, me: { name: string; login?: string | undefined }): boolean {
  const a = entry.approval;
  if (!a) return false;
  return a.requestedLogin ? a.requestedLogin === me.login : a.requestedBy === me.name;
}

/** The bill desk may return only purchases it recorded itself (and that the admin approved). */
export function canRequestReturn(purchase: StockEntry, me: { name: string; login?: string | undefined }, now = Date.now()): boolean {
  return canReturnPurchase(purchase, now) && requestedByMe(purchase, me);
}

/** What changed since this device last looked, for sound + pop-up alerts in both directions. */
export interface PurchaseAlert { id: string; kind: "requested" | "approved" | "rejected"; entry: StockEntry }
export function purchaseAlerts(entries: StockEntry[], seen: Record<string, string>, me: { admin: boolean; name: string; login?: string | undefined }): PurchaseAlert[] {
  const out: PurchaseAlert[] = [];
  for (const e of entries) {
    if (!e.approval) continue;
    const status = e.approval.status;
    if (seen[e.id] === status) continue;
    const mine = requestedByMe(e, me);
    // Admins hear every new request; the sender hears the decision; other admins hear a decision they didn't make.
    if (status === "pending" && me.admin && !mine) out.push({ id: e.id, kind: "requested", entry: e });
    const decided = status === "approved" || status === "rejected";
    const decidedByMe = e.approval.decidedBy === me.name;
    if (decided && seen[e.id] !== undefined && (mine || (me.admin && !decidedByMe))) out.push({ id: e.id, kind: status, entry: e });
  }
  return out;
}

export type SpendPeriod = "day" | "week" | "month";
export interface SpendBucket { key: string; label: string; start: number; total: number; bySupplier: Record<string, number> }
export interface SpendView { buckets: SpendBucket[]; suppliers: { key: string; name: string; amount: number }[]; total: number }

function bucketStart(at: number, period: SpendPeriod): Date {
  const d = new Date(at); d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // weeks start Monday
  if (period === "month") d.setDate(1);
  return d;
}
function stepBack(d: Date, period: SpendPeriod): Date {
  const n = new Date(d);
  if (period === "day") n.setDate(n.getDate() - 1); else if (period === "week") n.setDate(n.getDate() - 7); else n.setMonth(n.getMonth() - 1);
  return n;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function bucketLabel(d: Date, period: SpendPeriod): string {
  return period === "month" ? `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Approved spend (net of returns) per supplier for the last `count` days, weeks (Mon–Sun) or months, oldest first. */
export function spendBySupplier(entries: StockEntry[], suppliers: { id: string; name: string }[], period: SpendPeriod, now = Date.now(), count = period === "day" ? 14 : 12): SpendView {
  const starts: Date[] = [];
  let d = bucketStart(now, period);
  for (let i = 0; i < count; i++) { starts.unshift(d); d = stepBack(d, period); }
  const buckets: SpendBucket[] = starts.map((s) => ({ key: localDay(s.getTime()), label: bucketLabel(s, period), start: s.getTime(), total: 0, bySupplier: {} }));
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const totals = new Map<string, { key: string; name: string; amount: number }>();
  for (const v of supplierHistories(entries, suppliers)) for (const day of v.days) for (const e of day.entries) {
    const b = byKey.get(localDay(bucketStart(e.at, period).getTime()));
    if (!b) continue;
    const amt = entryAmount(e);
    b.bySupplier[v.key] = Math.round(((b.bySupplier[v.key] ?? 0) + amt) * 100) / 100;
    b.total = Math.round((b.total + amt) * 100) / 100;
    const t = totals.get(v.key) ?? { key: v.key, name: v.name, amount: 0 };
    t.amount = Math.round((t.amount + amt) * 100) / 100;
    totals.set(v.key, t);
  }
  const list = [...totals.values()].sort((a, b) => b.amount - a.amount);
  return { buckets, suppliers: list, total: Math.round(list.reduce((n, s) => n + s.amount, 0) * 100) / 100 };
}

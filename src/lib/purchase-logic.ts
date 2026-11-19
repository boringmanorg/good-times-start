import type { Material, StockEntry } from "./types";

export const PURCHASE_RETURN_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Approved, waiting, or rejected. Entries an admin recorded directly have no approval and count as approved. */
export function approvalStatus(entry: Pick<StockEntry, "approval">): "approved" | "pending" | "rejected" {
  return entry.approval?.status ?? "approved";
}
/** Only approved purchases and returns count in history, totals and vendor amounts. */
export const counts = (entry: Pick<StockEntry, "approval">) => approvalStatus(entry) === "approved";

export function purchaseApprovedAt(purchase: StockEntry): number {
  return purchase.approval?.decidedAt ?? purchase.approvedAt ?? purchase.at;
}

export function purchaseReturnDeadline(purchase: StockEntry): number {
  return purchaseApprovedAt(purchase) + PURCHASE_RETURN_WINDOW_MS;
}

export function canReturnPurchase(purchase: StockEntry, now = Date.now()): boolean {
  return purchase.type === "purchase" && counts(purchase) && now >= purchaseApprovedAt(purchase) && now <= purchaseReturnDeadline(purchase);
}

export function remainingPurchaseQty(purchase: StockEntry, returns: StockEntry[], materialId: string): number {
  const bought = purchase.items.filter((i) => i.materialId === materialId).reduce((n, i) => n + i.qty, 0);
  // Returns still waiting for approval count too, so two requests can't over-return; rejected ones don't.
  const returned = returns.filter((e) => e.purchaseId === purchase.id && approvalStatus(e) !== "rejected").flatMap((e) => e.items)
    .filter((i) => i.materialId === materialId).reduce((n, i) => n + Math.abs(i.qty), 0);
  return Math.max(0, Math.round((bought - returned) * 1000) / 1000);
}

export function validatePurchaseReturn(purchase: StockEntry, returns: StockEntry[], items: StockEntry["items"], now = Date.now()): void {
  if (!canReturnPurchase(purchase, now)) throw new Error("Supplier returns are available only within 48 hours of admin approval.");
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

/** Signed amount of an entry: purchases add (with their round-off, so it is what was paid), supplier returns subtract. */
export function entryAmount(entry: StockEntry): number {
  const sign = entry.type === "return" ? -1 : 1;
  const lines = entry.items.reduce((n, i) => n + Math.abs(i.qty) * (i.unitCost ?? 0), 0);
  return Math.round((sign * lines + (entry.type === "purchase" ? entry.roundOff ?? 0 : 0)) * 100) / 100;
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

/* ---- Item price trends and period summaries (Spend dashboard, Items tab) ---- */

export interface ItemInsight { lastPrice?: number; previousPrice?: number; changePct?: number; averagePrice?: number; lastAt?: number; lastSupplier?: string }

/** Latest and previous purchase price of an item, the change between them, and the average price paid. */
export function itemInsight(lines: PurchaseLineView[]): ItemInsight {
  const buys = lines.filter((l) => l.kind === "purchase").sort((a, b) => b.at - a.at);
  const last = buys[0];
  if (!last) return {};
  const previous = buys.find((l) => l.entryId !== last.entryId);
  const qty = buys.reduce((n, l) => n + l.qty, 0);
  const amount = buys.reduce((n, l) => n + l.amount, 0);
  const changePct = previous && previous.unitCost > 0 ? Math.round(((last.unitCost - previous.unitCost) / previous.unitCost) * 1000) / 10 : undefined;
  return {
    lastPrice: last.unitCost, lastAt: last.at, lastSupplier: last.supplier,
    ...(previous ? { previousPrice: previous.unitCost } : {}),
    ...(changePct !== undefined ? { changePct } : {}),
    ...(qty > 0 ? { averagePrice: Math.round((amount / qty) * 100) / 100 } : {}),
  };
}

/** Approved purchases and linked returns between `from` (inclusive) and `to` (exclusive). */
export function entriesBetween(entries: StockEntry[], from: number, to: number): StockEntry[] {
  return entries.filter((e) => counts(e) && e.at >= from && e.at < to && (e.type === "purchase" || (e.type === "return" && !!e.purchaseId)));
}

export interface SpendSummary { spend: number; bills: number; averageBill: number; returns: number; payLater: number }

/** Net spend, bill count, average bill, returns and "pay later" for a set of entries. */
export function spendSummary(entries: StockEntry[]): SpendSummary {
  const purchases = entries.filter((e) => e.type === "purchase");
  const bought = purchases.reduce((n, e) => n + entryAmount(e), 0);
  const returns = -entries.filter((e) => e.type === "return").reduce((n, e) => n + entryAmount(e), 0);
  const payLater = purchases.flatMap((e) => e.payments ?? []).filter((p) => p.mode === "credit").reduce((n, p) => n + p.amount, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { spend: r2(bought - returns), bills: purchases.length, averageBill: purchases.length ? r2(bought / purchases.length) : 0, returns: r2(returns), payLater: r2(payLater) };
}

export interface TopItem { materialId: string; name: string; unit: string; qty: number; amount: number }

/** Items by net spend (returns subtracted) in these entries, most first. */
export function topItems(entries: StockEntry[], materials: { id: string; name: string; unit: string }[]): TopItem[] {
  const map = new Map<string, TopItem>();
  for (const e of entries) {
    const sign = e.type === "return" ? -1 : 1;
    for (const i of e.items) {
      const known = materials.find((m) => m.id === i.materialId);
      const row = map.get(i.materialId) ?? { materialId: i.materialId, name: i.name ?? known?.name ?? "Deleted item", unit: i.unit ?? known?.unit ?? "pcs", qty: 0, amount: 0 };
      row.qty = Math.round((row.qty + sign * Math.abs(i.qty)) * 1000) / 1000;
      row.amount = Math.round((row.amount + sign * Math.abs(i.qty) * (i.unitCost ?? 0)) * 100) / 100;
      map.set(i.materialId, row);
    }
  }
  return [...map.values()].filter((r) => r.amount !== 0 || r.qty !== 0).sort((a, b) => b.amount - a.amount);
}

/* ---- Bill lists (Purchases and History tabs) ---- */

export interface BillDay { day: string; label: string; entries: StockEntry[]; total: number }

/** "Today", "Yesterday", or "Mon, 17 Nov 2026" for a list heading. */
export function billDayLabel(at: number, now = Date.now()): string {
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(at);
  return `${d.toLocaleDateString("en-IN", { weekday: "short" })}, ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Bills grouped by local day, newest first, each day with its net total (returns subtract; rejected bills don't count). */
export function billsByDay(entries: StockEntry[], now = Date.now()): BillDay[] {
  const days = new Map<string, BillDay>();
  for (const e of [...entries].sort((a, b) => b.at - a.at)) {
    const d = new Date(e.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = days.get(key) ?? { day: key, label: billDayLabel(e.at, now), entries: [], total: 0 };
    row.entries.push(e);
    if (counts(e)) row.total = Math.round((row.total + entryAmount(e)) * 100) / 100;
    days.set(key, row);
  }
  return [...days.values()];
}

/** Does a bill match what was typed: vendor, invoice number or any item on it. */
export function billMatches(e: StockEntry, typed: string, vendor: string, itemName: (i: StockEntry["items"][number]) => string): boolean {
  const q = typed.trim().toLowerCase();
  if (!q) return true;
  return vendor.toLowerCase().includes(q) || (e.reference ?? "").toLowerCase().includes(q) || e.items.some((i) => itemName(i).toLowerCase().includes(q));
}

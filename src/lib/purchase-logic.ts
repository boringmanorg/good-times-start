import type { Material, StockEntry } from "./types";

export const PURCHASE_RETURN_WINDOW_MS = 48 * 60 * 60 * 1000;

export function canReturnPurchase(purchase: StockEntry, now = Date.now()): boolean {
  return purchase.type === "purchase" && now >= purchase.at && now <= purchase.at + PURCHASE_RETURN_WINDOW_MS;
}

export function remainingPurchaseQty(purchase: StockEntry, returns: StockEntry[], materialId: string): number {
  const bought = purchase.items.filter((i) => i.materialId === materialId).reduce((n, i) => n + i.qty, 0);
  const returned = returns.filter((e) => e.purchaseId === purchase.id).flatMap((e) => e.items)
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
  return entries.filter((e) => e.type === "purchase" || (e.type === "return" && e.purchaseId))
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
  const relevant = entries.filter((e) => e.type === "purchase" || (e.type === "return" && e.purchaseId));
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

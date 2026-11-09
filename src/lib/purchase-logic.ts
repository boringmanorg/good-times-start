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
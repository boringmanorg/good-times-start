import { describe, expect, it } from "vitest";
import { entriesBetween, itemInsight, itemPurchaseLines, spendSummary, topItems } from "./purchase-logic";
import type { StockEntry } from "./types";

const day = (d: number) => Date.UTC(2026, 10, d, 6);
const p = (id: string, d: number, items: StockEntry["items"], extra: Partial<StockEntry> = {}): StockEntry => ({ id, type: "purchase", at: day(d), items, supplierName: "Fresh Mart", ...extra });
const entries: StockEntry[] = [
  p("p1", 1, [{ materialId: "onion", qty: 10, unitCost: 40, name: "Onion", unit: "kg" }]),
  p("p2", 8, [{ materialId: "onion", qty: 10, unitCost: 46, name: "Onion", unit: "kg" }, { materialId: "milk", qty: 5, unitCost: 60, name: "Milk", unit: "l" }],
    { payments: [{ mode: "upi", amount: 500 }, { mode: "credit", amount: 260.4 }], roundOff: 0.4 }),
  { id: "r1", type: "return", at: day(9), purchaseId: "p2", items: [{ materialId: "onion", qty: -2, unitCost: 46 }] },
  p("p3", 10, [{ materialId: "onion", qty: 5, unitCost: 44 }], { approval: { status: "pending", requestedBy: "Billdesk", requestedAt: day(10) } }),
];

describe("purchase insights", () => {
  it("item price trend: latest ₹46 vs previous ₹40 is +15%; average over approved buys", () => {
    const lines = itemPurchaseLines("onion", entries, []);
    expect(itemInsight(lines)).toEqual({ lastPrice: 46, previousPrice: 40, changePct: 15, averagePrice: 43, lastAt: day(8), lastSupplier: "Fresh Mart" });
  });
  it("an item bought once has no trend; never bought has nothing", () => {
    expect(itemInsight(itemPurchaseLines("milk", entries, []))).toEqual({ lastPrice: 60, averagePrice: 60, lastAt: day(8), lastSupplier: "Fresh Mart" });
    expect(itemInsight([])).toEqual({});
  });
  it("period summary: pending bills don't count, returns come off, round-off is in, pay later is shown", () => {
    const window = entriesBetween(entries, day(1), day(11));
    expect(window.map((e) => e.id)).toEqual(["p1", "p2", "r1"]);
    expect(spendSummary(window)).toEqual({ spend: 1068.4, bills: 2, averageBill: 580.2, returns: 92, payLater: 260.4 });
  });
  it("top items by net spend", () => {
    expect(topItems(entriesBetween(entries, day(1), day(11)), [])).toEqual([
      { materialId: "onion", name: "Onion", unit: "kg", qty: 18, amount: 768 },
      { materialId: "milk", name: "Milk", unit: "l", qty: 5, amount: 300 },
    ]);
  });
});

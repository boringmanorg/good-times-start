import { describe, expect, it } from "vitest";
import { canReturnPurchase, purchaseItemSummary, validatePurchaseReturn } from "./purchase-logic";
import type { StockEntry } from "./types";

const purchase: StockEntry = { id: "p1", type: "purchase", at: 1000000, items: [{ materialId: "rice", qty: 10, unitCost: 80 }] };
describe("supplier purchase rules", () => {
  it("permits returns through 48 hours and refuses the next millisecond", () => {
    expect(canReturnPurchase(purchase, purchase.at + 48 * 3600000)).toBe(true);
    expect(canReturnPurchase(purchase, purchase.at + 48 * 3600000 + 1)).toBe(false);
    expect(() => validatePurchaseReturn(purchase, [], [{ materialId: "rice", qty: -1 }], purchase.at + 48 * 3600000 + 1)).toThrow(/48 hours/);
  });
  it("limits returns to the unreturned purchased quantity", () => {
    const returned: StockEntry = { id: "r1", type: "return", purchaseId: "p1", at: purchase.at, items: [{ materialId: "rice", qty: -7 }] };
    expect(() => validatePurchaseReturn(purchase, [returned], [{ materialId: "rice", qty: -4 }], purchase.at)).toThrow(/remaining/);
    expect(() => validatePurchaseReturn(purchase, [returned], [{ materialId: "rice", qty: -3 }], purchase.at)).not.toThrow();
  });
  it("keeps standard prices separate from latest purchase price and quantity", () => {
    const material = { id: "rice", name: "Rice", unit: "kg" as const, lowStockLevel: 0, costPerUnit: 75 };
    const later = { ...purchase, id: "p2", at: purchase.at + 3 * 86400000, items: [{ materialId: "rice", qty: 5, unitCost: 90 }] };
    expect(purchaseItemSummary(material, [purchase, later])).toMatchObject({ count: 2, lastQty: 5, lastPrice: 90, averageDays: 3 });
    expect(material.costPerUnit).toBe(75);
    expect(purchaseItemSummary(material, [])).toMatchObject({ count: 0, lastQty: undefined, lastPrice: undefined });
  });
});
import { entryAmount, itemPurchaseLines, itemTotals, supplierHistories } from "./purchase-logic";
describe("purchase history views", () => {
  const day = (d: number, h = 10) => new Date(2026, 10, d, h).getTime();
  const entries = [
    { id: "p1", type: "purchase" as const, at: day(8), supplierId: "s1", supplierName: "Lyngdoh Traders", reference: "INV-1", items: [{ materialId: "rice", qty: 10, unitCost: 100 }, { materialId: "dal", qty: 2, unitCost: 120 }] },
    { id: "p2", type: "purchase" as const, at: day(9, 9), supplierId: "s1", supplierName: "Lyngdoh Traders", items: [{ materialId: "rice", qty: 5, unitCost: 110 }] },
    { id: "r1", type: "return" as const, at: day(9, 12), purchaseId: "p2", items: [{ materialId: "rice", qty: -1, unitCost: 110 }] },
    { id: "p3", type: "purchase" as const, at: day(9, 15), items: [{ materialId: "dal", qty: 1, unitCost: 130 }] },
  ];
  const suppliers = [{ id: "s1", name: "Lyngdoh Traders" }];
  it("lists an item's purchases and returns newest first, with net totals", () => {
    const lines = itemPurchaseLines("rice", entries, suppliers);
    expect(lines.map((l) => [l.kind, l.qty, l.amount, l.supplier])).toEqual([["return", 1, -110, "Lyngdoh Traders"], ["purchase", 5, 550, "Lyngdoh Traders"], ["purchase", 10, 1000, "Lyngdoh Traders"]]);
    expect(itemTotals(lines)).toEqual({ qty: 14, amount: 1440, bills: 2 });
  });
  it("totals each vendor net of returns and splits it into days", () => {
    const v = supplierHistories(entries, suppliers);
    expect(v.map((x) => [x.name, x.amount, x.bills, x.returns])).toEqual([["Supplier not recorded", 130, 1, 0], ["Lyngdoh Traders", 1680, 2, 1]]);
    expect(v[1]?.days.map((d) => d.amount)).toEqual([440, 1240]);
    expect(entryAmount(entries[2]!)).toBe(-110);
  });
});

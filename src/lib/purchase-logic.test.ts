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
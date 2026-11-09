import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDevices } from "./fakes/fake-dexie";
vi.mock("dexie", async () => ({ default: (await import("./fakes/fake-dexie")).default }));
let db: typeof import("@/lib/db");
let actions: typeof import("@/lib/stock-actions");
beforeAll(async () => { db = await import("@/lib/db"); actions = await import("@/lib/stock-actions"); });
beforeEach(() => fakeDevices.reset());
describe("immutable purchase records", () => {
  it("adds a standard-priced item without quantity and refuses later modifications", async () => {
    const material = { id: "rice", name: "Rice", unit: "kg" as const, costPerUnit: 80, lowStockLevel: 0 };
    await actions.saveMaterial(material);
    await expect(actions.saveMaterial({ ...material, costPerUnit: 90 })).rejects.toThrow(/cannot be modified/);
    expect(await db.getDb().materials.get("rice")).toEqual(material);
  });
  it("preserves the original invoice when an item is returned", async () => {
    const purchase = await actions.recordStockEntry({ id: "p1", type: "purchase", items: [{ materialId: "rice", qty: 5, unitCost: 80 }] });
    await expect(actions.recordStockEntry({ ...purchase, items: [{ materialId: "rice", qty: 9, unitCost: 80 }] })).rejects.toThrow(/cannot be modified/);
    await actions.recordStockEntry({ type: "return", purchaseId: "p1", items: [{ materialId: "rice", qty: -2 }] });
    expect(await db.getDb().stockEntries.get("p1")).toEqual(purchase);
    await expect(actions.recordStockEntry({ type: "return", purchaseId: "p1", items: [{ materialId: "rice", qty: -4 }] })).rejects.toThrow(/remaining/);
  });
  it("never deducts or reverses recipe ingredients on customer sales", async () => {
    await db.getDb().menu.put({ id: "dish", name: "Dish", price: 100, category: "Food", veg: true, gstRate: 0, available: true, station: "Kitchen", recipe: [{ materialId: "rice", qty: 1 }] });
    const lines = [{ itemId: "dish", name: "Dish", qty: 2, price: 100, veg: true, gstRate: 0, station: "Kitchen" }];
    await actions.recordSaleConsumption(lines, { orderUid: "bill1", billNo: "POS/0001" });
    await actions.reverseSaleConsumption(lines, { orderUid: "bill1", billNo: "POS/0001" });
    expect(await db.getDb().stockEntries.count()).toBe(0);
    expect(await db.getDb().outbox.count()).toBe(0);
  });
});
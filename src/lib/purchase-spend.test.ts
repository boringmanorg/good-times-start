import { describe, expect, it } from "vitest";
import { spendBySupplier } from "./purchase-logic";
import type { StockEntry } from "./types";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const buy = (id: string, sup: string, t: number, amt: number, extra: Partial<StockEntry> = {}) => ({ id, type: "purchase", supplierId: sup, at: t, items: [{ materialId: "m", qty: 1, unitCost: amt }], ...extra }) as unknown as StockEntry;
const sups = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }];
const now = at(2026, 11, 12); // Thursday

describe("spendBySupplier", () => {
  const entries = [buy("1", "a", now, 500), buy("2", "b", at(2026, 11, 10), 300), buy("3", "a", at(2026, 10, 5), 200),
    { id: "r", type: "return", purchaseId: "1", at: now, items: [{ materialId: "m", qty: 1, unitCost: 100 }] } as unknown as StockEntry];
  it("daily: today's spend per supplier is net of returns", () => {
    const v = spendBySupplier(entries, sups, "day", now);
    expect(v.buckets).toHaveLength(14);
    expect(v.buckets.at(-1)!.bySupplier["a"]).toBe(400);
  });
  it("weekly: Mon 9 Nov – Sun 15 Nov groups both suppliers", () => {
    const w = spendBySupplier(entries, sups, "week", now).buckets.at(-1)!;
    expect(w.total).toBe(700);
  });
  it("monthly: October purchase lands in October", () => {
    const v = spendBySupplier(entries, sups, "month", now);
    expect(v.buckets.at(-2)!.bySupplier["a"]).toBe(200);
    expect(v.total).toBe(900);
  });
  it("pending purchases are not counted", () => {
    const v = spendBySupplier([buy("p", "a", now, 999, { approval: { status: "pending" } } as Partial<StockEntry>)], sups, "day", now);
    expect(v.total).toBe(0);
  });
});

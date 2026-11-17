import { describe, expect, it } from "vitest";
import { previousRange, purchaseSpend, summaryInsights } from "./summary-insights";
import type { Order, StockEntry } from "./types";

const DAY = 86_400_000;
const from = new Date(2026, 10, 10).getTime();
const range = { from, to: from + 7 * DAY - 1 };
const bill = (at: number, total: number, phone?: string, name = "Biryani", qty = 1) => ({
  uid: `b${at}${total}`, status: "settled", createdAt: at, settledAt: at, total, subtotal: total, discount: 0, cgst: 0, sgst: 0,
  payments: [{ mode: "cash", amount: total }], lines: [{ itemId: name, name, price: total / qty, qty }], ...(phone ? { customer: { phone } } : {}),
}) as unknown as Order;

describe("summary insights", () => {
  it("compares with the period of the same length just before", () => {
    expect(previousRange(range)).toEqual({ from: from - 7 * DAY, to: from - 1 });
    const i = summaryInsights([bill(from + DAY, 1500)], [bill(from - DAY, 1000)], [], range);
    expect(i.netChange).toBe(0.5);
  });
  it("counts a guest as returning only if they billed before this period", () => {
    const i = summaryInsights([bill(from + DAY, 100, "9876543210"), bill(from + DAY, 100, "9000000000")], [bill(from - DAY, 100, "+91 98765 43210")], [], range);
    expect(i.guests).toEqual({ identified: 2, returning: 1, returningShare: 0.5 });
  });
  it("counts only approved purchases less their returns in the period", () => {
    const entries = [
      { id: "p", type: "purchase", at: from + DAY, items: [{ materialId: "m", qty: 10, unitCost: 50 }] },
      { id: "q", type: "purchase", at: from + DAY, items: [{ materialId: "m", qty: 10, unitCost: 50 }], approval: { status: "pending" } },
      { id: "r", type: "return", purchaseId: "p", at: from + 2 * DAY, items: [{ materialId: "m", qty: -2, unitCost: 50 }] },
      { id: "t", type: "transfer_in", at: from + DAY, items: [{ materialId: "m", qty: 5, unitCost: 50 }] },
    ] as unknown as StockEntry[];
    expect(purchaseSpend(entries, range)).toBe(400);
  });
});

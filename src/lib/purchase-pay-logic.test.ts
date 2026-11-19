import { describe, expect, it } from "vitest";
import { itemsTotal, paymentText, purchasePayable, purchasePayProblem, purchaseRoundOffOffer, spendByMode } from "./purchase-pay-logic";
import { entryAmount } from "./purchase-logic";
import type { StockEntry } from "./types";

const items = [{ materialId: "onion", qty: 12.5, unitCost: 39.9 }, { materialId: "milk", qty: 8, unitCost: 93.5 }] as StockEntry["items"]; // 498.75 + 748 = 1246.75
const entry = (extra: Partial<StockEntry> = {}): StockEntry => ({ id: "p1", type: "purchase", at: 1, items, ...extra });

describe("paying for a purchase", () => {
  it("adds up the lines", () => expect(itemsTotal(items)).toBe(1246.75));

  it("one method for the whole bill", () => {
    expect(purchasePayProblem(1246.75, [{ mode: "cash", amount: 1246.75 }])).toBeNull();
  });

  it("split across methods, including pay later", () => {
    expect(purchasePayProblem(1246.75, [{ mode: "upi", amount: 500 }, { mode: "credit", amount: 746.75 }])).toBeNull();
  });

  it("round-off: ₹1,246.75 paid as ₹1,247 is +₹0.25, and spend counts what was paid", () => {
    const payments = [{ mode: "cash" as const, amount: 1247 }];
    expect(purchaseRoundOffOffer(1246.75, payments)).toBe(0.25);
    expect(purchasePayProblem(1246.75, payments, 0.25)).toBeNull();
    expect(purchasePayable(entry({ roundOff: 0.25 }))).toBe(1247);
    expect(entryAmount(entry({ roundOff: 0.25, payments }))).toBe(1247);
  });

  it("round down too, but never past ₹100", () => {
    expect(purchaseRoundOffOffer(1246.75, [{ mode: "upi", amount: 1200 }])).toBe(-46.75);
    expect(purchaseRoundOffOffer(1246.75, [{ mode: "upi", amount: 1100 }])).toBeNull();
    expect(purchasePayProblem(1246.75, [{ mode: "upi", amount: 1146 }], -100.75)).toMatch(/₹100/);
  });

  it("says what's wrong", () => {
    expect(purchasePayProblem(1246.75, [])).toBe("Add how this purchase was paid");
    expect(purchasePayProblem(1246.75, [{ mode: "cash", amount: 1000 }])).toBe("₹246.75 still to account for");
    expect(purchasePayProblem(1246.75, [{ mode: "cash", amount: 1300 }])).toBe("Payments are ₹53.25 more than the bill");
    expect(purchasePayProblem(1246.75, [{ mode: "cash", amount: 0 }, { mode: "upi", amount: 1246.75 }])).toMatch(/above zero/);
    expect(purchasePayProblem(10, [{ mode: "gpay" as never, amount: 10 }])).toMatch(/method/);
  });

  it("nothing to round when nothing is entered or it already matches", () => {
    expect(purchaseRoundOffOffer(1246.75, [])).toBeNull();
    expect(purchaseRoundOffOffer(1246.75, [{ mode: "cash", amount: 1246.75 }])).toBeNull();
  });

  it("reads for the history list", () => {
    expect(paymentText(entry())).toBe("Payment not recorded");
    expect(paymentText(entry({ payments: [{ mode: "upi", amount: 500 }, { mode: "credit", amount: 746.75 }] }))).toBe("UPI ₹500 + Pay later ₹746.75");
  });

  it("spend by method, with older purchases as unrecorded", () => {
    const list = [
      entry({ id: "a", payments: [{ mode: "upi", amount: 500 }, { mode: "credit", amount: 747 }], roundOff: 0.25 }),
      entry({ id: "b", payments: [{ mode: "cash", amount: 1246.75 }] }),
      entry({ id: "c" }),
      { id: "r", type: "return", at: 2, items: [{ materialId: "milk", qty: -1, unitCost: 93.5 }], purchaseId: "b" } as StockEntry,
    ];
    expect(spendByMode(list)).toEqual([
      { mode: "cash", amount: 1246.75 }, { mode: "upi", amount: 500 }, { mode: "credit", amount: 747 }, { mode: "unrecorded", amount: 1246.75 },
    ]);
  });
});

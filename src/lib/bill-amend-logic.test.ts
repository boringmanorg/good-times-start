import { describe, expect, it } from "vitest";
import { amendBlocked, amendedBill, AMEND_WINDOW_MS, paymentsText } from "./bill-amend-logic";
import type { Order } from "./types";

const SETTLED = Date.UTC(2026, 10, 18, 12, 35);
const lines = [[180, 1], [129, 3], [199, 2], [39, 2], [160, 2], [299, 1]].map(([price, qty], i) => ({ itemId: `i${i}`, name: "x", price, qty, gstRate: 5 })) as Order["lines"];
const nc: Order = {
  uid: "b1", billNo: "POS/0002", orderType: "dine-in", lines, subtotal: 1662, discountPct: 100, discountAmt: 1662, taxable: 0,
  cgst: 0, sgst: 0, roundOff: 0, total: 0, payments: [], status: "settled", settledAt: SETTLED, createdAt: SETTLED - 86_400_000,
  tax: { exempt: true, roundToRupee: true }, synced: true,
};
const now = SETTLED + 3 * 3_600_000;

describe("correcting a settled bill", () => {
  it("POS/0002: NC → 30% with ₹663 UPI + ₹500 cash; round-off −0.40; settlement time kept", () => {
    const fixed = amendedBill(nc, { discountPct: 30, payments: [{ mode: "upi", amount: 663 }, { mode: "cash", amount: 500 }], reason: "Closed as NC by mistake" }, "Admin", true, now);
    if (typeof fixed === "string") throw new Error(fixed);
    expect(fixed).toMatchObject({ discountAmt: 498.6, taxable: 1163.4, roundOff: -0.4, total: 1163, settledAt: SETTLED, originalSettledAt: SETTLED, billNo: "POS/0002", lines, synced: false });
    expect(fixed.amendments).toHaveLength(1);
    expect(fixed.amendments![0]).toMatchObject({ at: now, by: "Admin", reason: "Closed as NC by mistake" });
    expect(fixed.amendments![0]!.from).toMatchObject({ total: 0, payments: [], discountPct: 100 });
    expect(fixed.amendments![0]!.to).toMatchObject({ total: 1163, discountPct: 30 });
  });

  it("guest actually paid ₹1162: the extra rupee becomes round-off", () => {
    const fixed = amendedBill(nc, { discountPct: 30, payments: [{ mode: "upi", amount: 1162 }], payTotal: 1162, reason: "Paid 1162" }, "Admin", true, now);
    if (typeof fixed === "string") throw new Error(fixed);
    expect(fixed.total).toBe(1162);
    expect(fixed.roundOff).toBe(-1.4);
  });

  it("wrong mode only: cash → UPI", () => {
    const paid = { ...nc, discountPct: 30, discountAmt: 498.6, taxable: 1163.4, roundOff: -0.4, total: 1163, payments: [{ mode: "cash" as const, amount: 1163 }] };
    const fixed = amendedBill(paid, { discountPct: 30, payments: [{ mode: "upi", amount: 1163 }], reason: "Paid by GPay" }, "Admin", true, now);
    if (typeof fixed === "string") throw new Error(fixed);
    expect(fixed.payments).toEqual([{ mode: "upi", amount: 1163 }]);
    expect(fixed.total).toBe(1163);
  });

  it("a second correction keeps the first one and the original 48-hour window", () => {
    const first = amendedBill(nc, { discountPct: 30, payments: [{ mode: "cash", amount: 1163 }], reason: "First fix" }, "Admin", true, now) as Order;
    const second = amendedBill(first, { discountPct: 30, payments: [{ mode: "upi", amount: 1163 }], reason: "Second fix" }, "Manager", true, now + 1000) as Order;
    expect(second.amendments!.map((a) => a.reason)).toEqual(["First fix", "Second fix"]);
    expect(second.originalSettledAt).toBe(SETTLED);
    expect(amendBlocked(second, true, SETTLED + AMEND_WINDOW_MS + 1)).toMatch(/48 hours/);
  });

  it("refuses: staff, after 48 hours, no reason, short or over payments, nothing changed, running bill", () => {
    const ok = { discountPct: 30, payments: [{ mode: "upi" as const, amount: 1163 }], reason: "Fix" };
    expect(amendedBill(nc, ok, "Billdesk", false, now)).toMatch(/owner or a manager/);
    expect(amendedBill(nc, ok, "Admin", true, SETTLED + AMEND_WINDOW_MS + 1)).toMatch(/48 hours/);
    expect(amendBlocked(nc, true, SETTLED + AMEND_WINDOW_MS)).toBeNull();
    expect(amendedBill(nc, { ...ok, reason: "  " }, "Admin", true, now)).toMatch(/reason/);
    expect(amendedBill(nc, { ...ok, reason: "x".repeat(501) }, "Admin", true, now)).toMatch(/under 500/);
    expect(amendedBill(nc, { ...ok, payments: [{ mode: "upi", amount: 1100 }] }, "Admin", true, now)).toBe("Payments are ₹63 short of the bill");
    expect(amendedBill(nc, { ...ok, payments: [{ mode: "upi", amount: 1200 }] }, "Admin", true, now)).toBe("Payments are ₹37 more than the bill");
    expect(amendedBill(nc, { discountPct: 100, payments: [], reason: "Same" }, "Admin", true, now)).toBe("Nothing has changed");
    expect(amendedBill({ ...nc, status: "held" }, ok, "Admin", true, now)).toMatch(/Only settled/);
  });

  it("round-off from the guest's payment stays within ±₹100", () => {
    expect(amendedBill(nc, { discountPct: 30, payments: [{ mode: "upi", amount: 1000 }], payTotal: 1000, reason: "x fix" }, "Admin", true, now)).toMatch(/₹100/);
  });

  it("gift card and points bills are left alone, and can't be added", () => {
    const gift = { ...nc, discountPct: 0, discountAmt: 0, taxable: 1662, total: 1662, payments: [{ mode: "gift_card" as const, amount: 1662 }] };
    expect(amendBlocked(gift, true, now)).toMatch(/gift card or loyalty points/);
    expect(amendedBill(nc, { discountPct: 30, payments: [{ mode: "points", amount: 1163 }], reason: "x fix" }, "Admin", true, now)).toMatch(/can't be added/);
  });

  it("reads payments for the history line", () => {
    expect(paymentsText([], (m) => m)).toBe("No payment (NC)");
    expect(paymentsText([{ mode: "upi", amount: 663 }, { mode: "cash", amount: 500 }], (m) => m.toUpperCase())).toBe("UPI ₹663 + CASH ₹500");
  });
});

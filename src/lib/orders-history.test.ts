import { describe, expect, it } from "vitest";
import { dayBounds, historyBills, isNcBill, paidBy } from "./orders-history";
import type { Order } from "./types";

const paid = (mode: string, amount: number) => ({ mode, amount });
const order = (over: Partial<Order>) => ({ uid: "x", status: "settled", createdAt: 1, payments: [], total: 0, ...over } as unknown as Order);

describe("Orders history", () => {
  it("splits closed bills into settled (paid), NC and cancelled", () => {
    const cash = order({ uid: "cash", payments: [paid("cash", 500)] as Order["payments"], total: 500, settledAt: 10 });
    const nc = order({ uid: "nc", settledAt: 11 });
    const voided = order({ uid: "void", status: "void", cancelledAt: 12 });
    const held = order({ uid: "run", status: "held" });
    const all = [cash, nc, voided, held];
    expect(historyBills(all, "settled").map((o) => o.uid)).toEqual(["cash"]);
    expect(historyBills(all, "nc").map((o) => o.uid)).toEqual(["nc"]);
    expect(historyBills(all, "cancelled").map((o) => o.uid)).toEqual(["void"]);
    expect(historyBills(all, "kots")).toEqual([]);
    expect(isNcBill(nc)).toBe(true);
    expect(isNcBill(cash)).toBe(false);
  });

  it("filters settled bills by how they were paid, including split payments", () => {
    const split = order({ payments: [paid("cash", 200), paid("upi", 300)] as Order["payments"] });
    const card = order({ payments: [paid("card", 400)] as Order["payments"] });
    expect([paidBy(split, "cash"), paidBy(split, "upi"), paidBy(split, "other")]).toEqual([true, true, false]);
    expect([paidBy(card, "cash"), paidBy(card, "other"), paidBy(card, "all")]).toEqual([false, true, true]);
  });

  it("uses inclusive start and exclusive next midnight for custom dates", () => {
    const [start, end] = dayBounds("2026-11-06");
    expect(start).toBe(new Date(2026, 10, 6).getTime());
    expect(end).toBe(new Date(2026, 10, 7).getTime());
  });

  it("lists a Room 7A bill opened yesterday on the day it was settled", () => {
    const today = dayBounds("2026-11-07");
    const yesterday = dayBounds("2026-11-06");
    const room = order({ uid: "7a", total: 1380, payments: [paid("cash", 1380)] as Order["payments"], createdAt: yesterday[0] + 1000, settledAt: today[0] + 1000 });
    expect(historyBills([room], "settled", today)).toEqual([room]);
    expect(historyBills([room], "settled", yesterday)).toEqual([]);
  });

  it("lists the last bill settled first", () => {
    const late = order({ uid: "late", payments: [paid("cash", 1)] as Order["payments"], settledAt: 900 });
    const early = order({ uid: "early", payments: [paid("upi", 1)] as Order["payments"], settledAt: 300 });
    expect(historyBills([early, late], "settled").map((o) => o.uid)).toEqual(["late", "early"]);
  });
});

import { openFor } from "./orders-history";
describe("newest first and open time", () => {
  it("lists the last settled, NC or cancelled bill first", () => {
    const bill = (uid: string, status: "settled" | "void", at: number, amount = 100) => ({ uid, billNo: uid, status, createdAt: at - 3_600_000, settledAt: status === "settled" ? at : undefined, cancelledAt: status === "void" ? at : undefined,
      payments: amount ? [{ mode: "upi", amount }] : [], lines: [], total: amount }) as never;
    const all = [bill("POS/0011", "settled", 1000_000), bill("POS/0013", "settled", 3000_000), bill("POS/0012", "settled", 2000_000, 0), bill("V1", "void", 500_000), bill("V2", "void", 900_000)];
    expect(historyBills(all, "settled").map((o) => o.uid)).toEqual(["POS/0013", "POS/0011"]);
    expect(historyBills(all, "cancelled").map((o) => o.uid)).toEqual(["V2", "V1"]);
    expect(historyBills(all, "nc").map((o) => o.uid)).toEqual(["POS/0012"]);
  });
  it("says how long a running bill has been open", () => {
    const now = 1_700_000_000_000;
    expect(openFor(now - 25 * 60_000, now)).toBe("25 min");
    expect(openFor(now - 135 * 60_000, now)).toBe("2 h 15 min");
    expect(openFor(now - 3 * 3_600_000, now)).toBe("3 h");
    expect(openFor(now - 27 * 3_600_000, now)).toBe("1 day 3 h");
    expect(openFor(now + 60_000, now)).toBe("0 min");
  });
});

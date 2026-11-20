import { describe, expect, it } from "vitest";
import { allocateOldestFirst, dayBook, ledgerProblem, moneyFlow, owedBills, profitAndLoss, vendorPayables } from "./ledger-logic";
import type { LedgerEntry, Order, StockEntry } from "./types";

const D = (d: number) => Date.parse(`2026-11-${String(d).padStart(2, "0")}T12:00:00+05:30`);
const purchase = (id: string, day: number, items: number, pay: { mode: string; amount: number }[], over: Partial<StockEntry> = {}): StockEntry =>
  ({ id, type: "purchase", at: D(day), items: [{ materialId: "m", qty: 1, unitCost: items }], supplierId: "v1", payments: pay, ...over } as StockEntry);
const ret = (id: string, of: string, day: number, value: number): StockEntry => ({ id, type: "return", at: D(day), purchaseId: of, items: [{ materialId: "m", qty: -1, unitCost: value }] } as StockEntry);
const pay = (id: string, day: number, amount: number, allocations: { purchaseId: string; amount: number }[], over: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, type: "vendor_payment", at: D(day), recordedAt: D(day), by: "Admin", amount, mode: "upi", supplierId: "v1", allocations, ...over });
const bill = (day: number, total: number, gst: number, payments: { mode: string; amount: number }[]): Order =>
  ({ uid: `b${day}${total}`, billNo: `POS/${day}`, status: "settled", settledAt: D(day), createdAt: D(day), total, cgst: gst / 2, sgst: gst / 2, payments, lines: [] } as unknown as Order);

describe("Pay later", () => {
  const entries = [
    purchase("p1", 1, 1000, [{ mode: "credit", amount: 1000 }]),
    purchase("p2", 3, 2000, [{ mode: "cash", amount: 500 }, { mode: "credit", amount: 1500 }]),
    purchase("p3", 4, 800, [{ mode: "upi", amount: 800 }]),
    purchase("p4", 5, 900, [{ mode: "credit", amount: 900 }], { approval: { status: "pending" } as NonNullable<StockEntry["approval"]> }),
    ret("r1", "p1", 2, 200),
  ];
  it("owes the credit less returns and payments, only on approved bills", () => {
    const owed = owedBills(entries, [pay("l1", 6, 300, [{ purchaseId: "p1", amount: 300 }])]);
    expect(owed.map((b) => [b.purchase.id, b.credit, b.returned, b.paid, b.owed])).toEqual([["p1", 1000, 200, 300, 500], ["p2", 1500, 0, 0, 1500]]);
  });
  it("ignores voided payments", () => {
    const owed = owedBills(entries, [pay("l1", 6, 300, [{ purchaseId: "p1", amount: 300 }], { void: { at: 1, by: "A", reason: "twice" } })]);
    expect(owed[0]?.owed).toBe(800);
  });
  it("pays the oldest bill first and keeps the rest as an advance", () => {
    const bills = owedBills(entries, []);
    expect(allocateOldestFirst(bills, 1000)).toEqual([{ purchaseId: "p1", amount: 800 }, { purchaseId: "p2", amount: 200 }]);
    const ledger = [pay("l1", 6, 2500, allocateOldestFirst(bills, 2500))];
    const v = vendorPayables(entries, ledger, [{ id: "v1", name: "Fresh Farms" }]);
    expect(v).toEqual([expect.objectContaining({ name: "Fresh Farms", owed: 0, unallocated: 200 })]);
  });
  it("checks an entry before saving", () => {
    const base = { type: "expense" as const, amount: 500, mode: "cash" as const, at: D(1), category: "rent" };
    expect(ledgerProblem(base)).toBeNull();
    expect(ledgerProblem({ ...base, amount: 0 })).toMatch(/above/);
    expect(ledgerProblem({ ...base, category: "x" })).toMatch(/what the expense/);
    expect(ledgerProblem({ ...base, at: Date.now() + 86_400_000 })).toMatch(/future/);
    expect(ledgerProblem({ type: "vendor_payment", amount: 100, mode: "upi", at: D(1), allocations: [{ purchaseId: "p", amount: 150 }], supplierId: "v1" })).toMatch(/More is set/);
    expect(ledgerProblem({ type: "vendor_payment", amount: 100, mode: "upi", at: D(1) })).toMatch(/vendor/);
  });
});

describe("the books", () => {
  const orders = [bill(1, 1050, 50, [{ mode: "cash", amount: 1050 }]), bill(2, 2100, 100, [{ mode: "upi", amount: 2000 }, { mode: "points", amount: 100 }]), bill(2, 300, 0, [])];
  const entries = [purchase("p1", 1, 1000, [{ mode: "credit", amount: 1000 }]), purchase("p2", 2, 600, [{ mode: "cash", amount: 600 }]), ret("r1", "p1", 2, 200)];
  const ledger: LedgerEntry[] = [
    { id: "e1", type: "expense", at: D(2), recordedAt: D(2), by: "A", amount: 400, mode: "cash", category: "gas" },
    { id: "e2", type: "expense", at: D(2), recordedAt: D(2), by: "A", amount: 999, mode: "bank", category: "rent", void: { at: 1, by: "A", reason: "wrong" } },
    { id: "i1", type: "income", at: D(2), recordedAt: D(2), by: "A", amount: 100, mode: "cash", category: "other_income" },
    { id: "i2", type: "income", at: D(2), recordedAt: D(2), by: "A", amount: 5000, mode: "bank", category: "owner_capital" },
    pay("v1", 2, 300, [{ purchaseId: "p1", amount: 300 }]),
  ];
  const from = D(1) - 43_200_000, to = D(3);
  it("profit & loss: sales before GST, purchases less returns, live expenses", () => {
    const pl = profitAndLoss(orders, entries, ledger, from, to);
    expect(pl).toMatchObject({ sales: 3300, gst: 150, bills: 3, ncBills: 1, purchases: 1600, returns: 200, netPurchases: 1400, expenses: 400, otherIncome: 100, grossProfit: 1900, operatingProfit: 1600 });
  });
  it("money by mode: pay later moves nothing, points aren't money", () => {
    expect(moneyFlow(orders, entries, ledger, from, to)).toEqual([
      { mode: "cash", moneyIn: 1150, moneyOut: 1000, net: 150 },
      { mode: "upi", moneyIn: 2000, moneyOut: 300, net: 1700 },
      { mode: "bank", moneyIn: 5000, moneyOut: 0, net: 5000 },
    ]);
  });
  it("day book lists every movement newest first, voided entries marked", () => {
    const lines = dayBook(orders, entries, ledger, from, to, () => "Fresh Farms");
    expect(lines.length).toBe(11);
    expect(lines.find((l) => l.id === "l:e2")?.voided).toBe(true);
    expect(lines.find((l) => l.id === "p:p1")?.title).toBe("Purchase · Fresh Farms · ₹1,000 on pay later");
    expect(lines[0]!.at >= lines[lines.length - 1]!.at).toBe(true);
  });
});

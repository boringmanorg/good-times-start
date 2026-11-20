import { describe, expect, it } from "vitest";
import { billDayLabel, billMatches, billsByDay } from "./purchase-logic";
import type { StockEntry } from "./types";

const now = new Date(2026, 10, 19, 19, 0).getTime();
const at = (d: number, h = 10) => new Date(2026, 10, d, h).getTime();
const p = (id: string, when: number, items: StockEntry["items"], extra: Partial<StockEntry> = {}): StockEntry => ({ id, type: "purchase", at: when, items, ...extra });
const entries = [
  p("a", at(19, 9), [{ materialId: "onion", qty: 10, unitCost: 40, name: "Onion" }], { reference: "INV-77", supplierName: "Fresh Mart" }),
  p("b", at(19, 11), [{ materialId: "milk", qty: 5, unitCost: 60, name: "Milk" }], { roundOff: 0.4 }),
  { id: "r", type: "return", at: at(19, 12), purchaseId: "a", items: [{ materialId: "onion", qty: -2, unitCost: 40 }] } as StockEntry,
  p("c", at(18), [{ materialId: "rice", qty: 2, unitCost: 100, name: "Rice" }]),
  p("x", at(18, 12), [{ materialId: "rice", qty: 9, unitCost: 100 }], { approval: { status: "rejected", requestedBy: "Billdesk", requestedAt: at(18) } }),
  p("d", at(15), [{ materialId: "rice", qty: 1, unitCost: 100 }]),
];

describe("purchase bill lists", () => {
  it("labels days", () => {
    expect(billDayLabel(at(19), now)).toBe("Today");
    expect(billDayLabel(at(18), now)).toBe("Yesterday");
    expect(billDayLabel(at(15), now)).toBe("Sun, 15 Nov 2026");
  });
  it("groups by day, newest first, with net day totals (returns off, rejected left out, round-off in)", () => {
    expect(billsByDay(entries, now).map((d) => [d.label, d.entries.map((e) => e.id), d.total])).toEqual([
      ["Today", ["r", "b", "a"], 620.4],
      ["Yesterday", ["x", "c"], 200],
      ["Sun, 15 Nov 2026", ["d"], 100],
    ]);
  });
  it("finds a bill by vendor, invoice or item", () => {
    const name = (i: StockEntry["items"][number]) => i.name ?? "";
    expect(billMatches(entries[0]!, "fresh", "Fresh Mart", name)).toBe(true);
    expect(billMatches(entries[0]!, "inv-7", "Fresh Mart", name)).toBe(true);
    expect(billMatches(entries[0]!, "onio", "Fresh Mart", name)).toBe(true);
    expect(billMatches(entries[0]!, "milk", "Fresh Mart", name)).toBe(false);
    expect(billMatches(entries[0]!, "  ", "Fresh Mart", name)).toBe(true);
  });
});

describe("purchase time shown", () => {
  const day = (h: number, m = 0) => new Date(2026, 10, 19, h, m).getTime();
  it("uses the bill's own time, else when it was entered that day, else none", async () => {
    const { purchaseTime } = await import("./purchase-logic");
    expect(purchaseTime({ at: day(14, 5) })).toBe(day(14, 5));
    expect(purchaseTime({ at: day(0), recordedAt: day(18, 30) })).toBe(day(18, 30));
    expect(purchaseTime({ at: day(0), approval: { status: "pending", requestedBy: "B", requestedAt: day(11) } as never })).toBe(day(11));
    expect(purchaseTime({ at: day(0), approvedAt: day(9, 15) })).toBe(day(9, 15));
    expect(purchaseTime({ at: day(0), recordedAt: day(0) + 2 * 86_400_000 })).toBeNull();
    expect(purchaseTime({ at: day(0) })).toBeNull();
  });
});

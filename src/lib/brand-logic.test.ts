import { describe, expect, it } from "vitest";
import type { OutletDay } from "./outlet-actions";
import {
  brandPnl, pnlByOutlet, transferLines, transferProblem,
  brandTotals, newOutletProblem, outletCountText, pushMenuProblem, ranked,
  shareOfBrand, totalsByOutlet, type Outlet,
} from "./brand-logic";

const outlets: Outlet[] = [
  { id: "a", name: "TAB Bistro", city: "Shillong", slug: "tab" },
  { id: "b", name: "TAB Express", city: "Guwahati", slug: "tab-x" },
  { id: "c", name: "TAB Cloud", city: "Chennai", slug: null },
];

const day = (id: string, d: string, bills: number, net: number, tax = 0): OutletDay => ({
  restaurant_id: id, day: d, bills, net, tax,
  dine_in: 0, takeaway: 0, delivery: 0, aggregator: 0, guest_ordered: 0,
});

describe("brand totals across outlets", () => {
  const days = [day("a", "2026-11-13", 10, 10000, 500), day("a", "2026-11-14", 5, 5000, 250), day("b", "2026-11-14", 4, 2000, 100)];

  it("adds each outlet's days up, and shows an outlet with no sales as zero", () => {
    const rows = totalsByOutlet(outlets, days);
    expect(rows).toEqual([
      { id: "a", bills: 15, net: 15000, tax: 750, average: 1000 },
      { id: "b", bills: 4, net: 2000, tax: 100, average: 500 },
      { id: "c", bills: 0, net: 0, tax: 0, average: 0 }, // open but quiet, not missing
    ]);
  });

  it("gives the brand one line of its own", () => {
    expect(brandTotals(totalsByOutlet(outlets, days))).toEqual({ bills: 19, net: 17000, tax: 850, average: 17000 / 19 });
  });

  it("ranks the busiest outlet first", () => {
    expect(ranked(totalsByOutlet(outlets, days)).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("works out each outlet's share, and never divides by zero", () => {
    const rows = totalsByOutlet(outlets, days);
    expect(shareOfBrand(rows[0]!, 17000)).toBeCloseTo(0.882, 3);
    expect(shareOfBrand(rows[2]!, 17000)).toBe(0);
    expect(shareOfBrand(rows[0]!, 0)).toBe(0); // a brand with no sales yet
  });
});

describe("adding an outlet", () => {
  it("wants a sensible name", () => {
    expect(newOutletProblem("TAB Express", 1, 50)).toBeNull();
    expect(newOutletProblem(" ", 1, 50)).toMatch(/name/i);
    expect(newOutletProblem("x".repeat(61), 1, 50)).toMatch(/60/);
  });

  it("stops at the plan's outlet limit", () => {
    expect(newOutletProblem("Second", 1, 1)).toMatch(/1 outlet\b/);
    expect(newOutletProblem("Fourth", 3, 3)).toMatch(/3 outlets/);
    expect(newOutletProblem("Next", 49, 50)).toBeNull();
    expect(newOutletProblem("Next", 50, 50)).toMatch(/50 outlets/);
  });

  it("allows any number when the plan sets no limit", () => {
    expect(newOutletProblem("Another", 99, null)).toBeNull();
  });
});

describe("pushing the menu across the brand", () => {
  it("needs a source and at least one real target", () => {
    expect(pushMenuProblem("a", ["b"])).toBeNull();
    expect(pushMenuProblem(null, ["b"])).toMatch(/copy the menu from/);
    expect(pushMenuProblem("a", [])).toMatch(/at least one outlet/);
    // Choosing only the source is not "push to all" — it is a mistake worth catching.
    expect(pushMenuProblem("a", ["a"])).toMatch(/at least one outlet/);
  });
});

describe("wording", () => {
  it("counts outlets in words", () => {
    expect(outletCountText(1)).toBe("1 outlet");
    expect(outletCountText(4)).toBe("4 outlets");
  });
});

describe("brand trading margin", () => {
  const days = [day("a", "2026-11-14", 10, 10000), day("b", "2026-11-14", 5, 4000)];
  const spend = [
    { restaurant_id: "a", day: "2026-11-14", entries: 2, spend: 3000 },
    { restaurant_id: "b", day: "2026-11-14", entries: 1, spend: 5000 }, // bought more than it sold
  ];

  it("takes purchase cost off each outlet's sales", () => {
    const rows = pnlByOutlet(outlets, days, spend);
    expect(rows[0]).toEqual({ id: "a", sales: 10000, spend: 3000, gross: 7000, margin: 0.7 });
    expect(rows[1]).toEqual({ id: "b", sales: 4000, spend: 5000, gross: -1000, margin: -0.25 });
    expect(rows[2]).toEqual({ id: "c", sales: 0, spend: 0, gross: 0, margin: 0 });
  });

  it("adds the brand up, and never divides by zero sales", () => {
    expect(brandPnl(pnlByOutlet(outlets, days, spend))).toEqual({ sales: 14000, spend: 8000, gross: 6000, margin: 6000 / 14000 });
    expect(brandPnl(pnlByOutlet(outlets, [], []))).toEqual({ sales: 0, spend: 0, gross: 0, margin: 0 });
  });
});

describe("sending stock to another outlet", () => {
  const line = (materialId: string, qty: number) => ({ materialId, qty });

  it("needs a destination and something to send", () => {
    expect(transferProblem("b", [line("rice", 5)])).toBeNull();
    expect(transferProblem(null, [line("rice", 5)])).toMatch(/outlet to send to/);
    expect(transferProblem("b", [])).toMatch(/at least one item/);
    expect(transferProblem("b", [line("rice", 0)])).toMatch(/at least one item/);
    expect(transferProblem("b", [line("", 5)])).toMatch(/at least one item/);
  });

  it("refuses the same item twice, so a quantity can't be silently halved", () => {
    expect(transferProblem("b", [line("rice", 5), line("rice", 2)])).toMatch(/listed twice/);
  });

  it("keeps only the lines worth sending", () => {
    expect(transferLines([line("rice", 5), line("", 2), line("dal", 0), line("oil", 1)]))
      .toEqual([line("rice", 5), line("oil", 1)]);
  });
});

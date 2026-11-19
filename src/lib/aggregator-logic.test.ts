import { describe, expect, it } from "vitest";
import { guestPlatform, integrationModeProblem, linkFor, planAllowsAggregators, platformBadge, platformOrderType, quickSandboxPicks, sandboxLines, sandboxPrice, sandboxTotal, type SandboxDish } from "./aggregator-logic";
import { PUBLIC_PLANS, PUBLIC_FEATURES } from "./plans";
import { cartLinesFromGuest } from "./guest-order-logic";
import type { MenuItem } from "./types";

const menu: SandboxDish[] = [
  { id: "a", name: "Paneer Tikka", price: 280, prices: { swiggy: 320 }, veg: true, available: true },
  { id: "b", name: "Pasta", price: 300, variantId: "half", variantPrice: 180, veg: true },
  { id: "c", name: "Off today", price: 100, available: false },
  { id: "d", name: "  ", price: 50 },
  { id: "e", name: "Free water", price: 0 },
  { id: "f", name: "Chicken Momo", price: 220, veg: false },
];

describe("Swiggy / Zomato plans", () => {
  it("is in Pro Lite, Pro and Enterprise, never Basic", () => {
    const has = Object.fromEntries(PUBLIC_PLANS.map((p) => [p.id, p.features.includes("aggregators")]));
    expect(has).toEqual({ basic: false, pro_lite: true, pro: true, enterprise: true });
  });
  it("isn't sold on the price cards while only the sandbox exists", () => {
    expect(PUBLIC_FEATURES).not.toContain("aggregators");
  });
  it("console modes follow the plan, and live waits for partner keys", () => {
    expect(planAllowsAggregators({ aggregators: true })).toBe(true);
    expect(planAllowsAggregators({})).toBe(false);
    expect(integrationModeProblem("off", false)).toBeNull();
    expect(integrationModeProblem("sandbox", false)).toMatch(/Pro Lite/);
    expect(integrationModeProblem("sandbox", true)).toBeNull();
    expect(integrationModeProblem("live", true)).toMatch(/partner API keys/);
    expect(linkFor([], "zomato")).toEqual({ platform: "zomato", mode: "off", storeId: "" });
  });
});

describe("platform orders on the POS", () => {
  it("are billed as Swiggy / Zomato, own orders keep their type", () => {
    expect(platformOrderType({ platform: "swiggy" }, "delivery")).toBe("swiggy");
    expect(platformOrderType({ platform: null }, "takeaway")).toBe("takeaway");
    expect(guestPlatform({ platform: "uber" as never })).toBeNull();
    expect(platformBadge({ platform: "zomato", is_test: true })).toBe("Zomato · sandbox test");
    expect(platformBadge({ platform: "swiggy" })).toBe("Swiggy");
    expect(platformBadge({})).toBe("");
  });
  it("ring up at the dish's Swiggy price", () => {
    const item: MenuItem = { id: "a", name: "Paneer Tikka", category: "Starters", price: 280, prices: { swiggy: 320 }, veg: true, gstRate: 5, station: "Kitchen", available: true };
    const { lines } = cartLinesFromGuest([{ itemId: "a", qty: 2, name: "Paneer Tikka", price: 320 }], [item], "online", "delivery", "swiggy");
    expect(lines[0]?.price).toBe(320);
    const own = cartLinesFromGuest([{ itemId: "a", qty: 1, name: "Paneer Tikka", price: 280 }], [item], "online", "delivery");
    expect(own.lines[0]?.price).toBe(280);
  });
});

describe("sandbox test orders", () => {
  it("price a dish like the platform would", () => {
    expect(sandboxPrice(menu[0]!, "swiggy")).toBe(320);
    expect(sandboxPrice(menu[0]!, "zomato")).toBe(280);
    expect(sandboxPrice(menu[1]!, "swiggy")).toBe(180);
  });
  it("only use available, named, priced dishes", () => {
    expect(Object.keys(quickSandboxPicks(menu, "swiggy", 5))).toEqual(["a", "b", "f"]);
    const lines = sandboxLines(menu, { a: 2, b: 1, c: 1, d: 1, e: 3, f: 0, zz: 1 }, "swiggy");
    expect(lines.map((l) => [l.itemId, l.qty, l.price, l.variantId])).toEqual([["a", 2, 320, undefined], ["b", 1, 180, "half"]]);
    expect(sandboxTotal(lines)).toBe(820);
  });
  it("cap quantities and line count", () => {
    const many = Array.from({ length: 40 }, (_, i): SandboxDish => ({ id: `m${i}`, name: `Dish ${i}`, price: 10 }));
    const lines = sandboxLines(many, Object.fromEntries(many.map((d) => [d.id, 99])), "zomato");
    expect(lines).toHaveLength(30);
    expect(lines[0]?.qty).toBe(20);
  });
});

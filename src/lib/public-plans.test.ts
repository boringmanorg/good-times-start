import { describe, expect, it, vi } from "vitest";
import { PUBLIC_PLANS } from "./plans";
import { planFromRow, priceRange, publicPlansFrom, type PlanCatalogueRow } from "./public-plans";

const row = (over: Partial<PlanCatalogueRow> = {}): PlanCatalogueRow => ({
  id: "basic", name: "Basic", monthly_price: 199, quote: false, tagline: "Billing and GST",
  billdesk_seats: 1, waiter_seats: 1, admin_seats: 1,
  features: { billing: true, menu: true, waiter_app: true, kds: false }, active: true, sort: 10, ...over,
});

describe("the published price list", () => {
  it("takes the catalogue's price and seats, not the compiled copy", () => {
    const p = planFromRow(row());
    expect(p.price).toBe(199);
    expect(p.seats).toEqual({ pos: 1, waiter: 1, manager: 1 });
    expect(p.tagline).toBe("Billing and GST");
  });

  it("shows no price for a plan the catalogue marks quote-only", () => {
    // "Call for quote" is a decision, so the stored number must not leak onto the page.
    const p = planFromRow(row({ id: "pro", monthly_price: 599, quote: true }));
    expect(p.price).toBeNull();
  });

  it("lists only the features the catalogue has switched on", () => {
    const p = planFromRow(row());
    expect(p.features).toEqual(expect.arrayContaining(["billing", "menu", "waiter_app"]));
    expect(p.features).not.toContain("kds");
    expect(p.features).not.toContain("accounting"); // absent key is off, not on
  });

  it("reads unlimited seats as unlimited, not as none", () => {
    const p = planFromRow(row({ id: "enterprise", billdesk_seats: null, waiter_seats: null, admin_seats: 4 }));
    expect(p.seats).toEqual({ pos: null, waiter: null, manager: 4 });
  });

  it("marks Pro as the highlighted card", () => {
    expect(planFromRow(row({ id: "pro" })).highlight).toBe(true);
    expect(planFromRow(row({ id: "basic" })).highlight).toBeUndefined();
  });

  it("keeps the ladder in catalogue order and leaves internal plans out", () => {
    const plans = publicPlansFrom([
      row({ id: "owner", name: "Owner", sort: 99 }),
      row({ id: "enterprise", name: "Enterprise / Brand", sort: 40 }),
      row({ id: "basic", name: "Basic", sort: 10 }),
      row({ id: "trial", name: "Free trial", sort: 1 }),
      row({ id: "pro", name: "Pro", sort: 30 }),
      row({ id: "pro_lite", name: "Pro Lite", sort: 20 }),
    ]);
    expect(plans.map((p) => p.id)).toEqual(["basic", "pro_lite", "pro", "enterprise"]);
  });

  it("drops a plan the catalogue has retired", () => {
    const plans = publicPlansFrom([row({ id: "basic", sort: 10 }), row({ id: "pro", sort: 30, active: false })]);
    expect(plans.map((p) => p.id)).toEqual(["basic"]);
  });

  it("falls back to the compiled list rather than showing an empty price section", () => {
    expect(publicPlansFrom([])).toBe(PUBLIC_PLANS);
    expect(publicPlansFrom([row({ id: "owner" }), row({ id: "trial" })])).toBe(PUBLIC_PLANS);
  });

  it("spans the published prices and ignores quote-only plans", () => {
    const plans = publicPlansFrom([
      row({ id: "basic", monthly_price: 199, sort: 10 }),
      row({ id: "pro", monthly_price: 599, quote: true, sort: 30 }),
      row({ id: "enterprise", monthly_price: 999, sort: 40 }),
    ]);
    expect(priceRange(plans)).toEqual({ low: 199, high: 999, count: 3 });
  });
});

describe("reading the catalogue", () => {
  it("maps what the cloud returns", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: () => ({ select: async () => ({ data: [row({ id: "basic", monthly_price: 199, sort: 10 }), row({ id: "pro", monthly_price: 599, quote: true, sort: 30 })], error: null }) }) },
    }));
    const { loadPublicPlans } = await import("./public-plans");
    const plans = await loadPublicPlans();
    expect(plans.map((p) => [p.id, p.price])).toEqual([["basic", 199], ["pro", null]]);
  });

  it("keeps the price list up when the cloud is unreachable", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: () => ({ select: async () => { throw new Error("Failed to fetch"); } }) },
    }));
    const { loadPublicPlans } = await import("./public-plans");
    expect(await loadPublicPlans()).toStrictEqual(PUBLIC_PLANS);
  });

  it("keeps the price list up when the cloud refuses the read", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: () => ({ select: async () => ({ data: null, error: { message: "permission denied" } }) }) },
    }));
    const { loadPublicPlans } = await import("./public-plans");
    expect(await loadPublicPlans()).toStrictEqual(PUBLIC_PLANS);
  });
});

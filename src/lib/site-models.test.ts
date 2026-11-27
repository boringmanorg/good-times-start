import { describe, expect, it } from "vitest";
import { MODEL_PATHS, SITE_MODELS, modelPlanRows } from "./site-models";
import { newPlanId, planProduct, PRODUCTS } from "./products";
import { planFitsProduct } from "./platform-restaurant-logic";
import type { PlanCatalogueRow } from "./public-plans";

const row = (id: string, price = 500, extra: Partial<PlanCatalogueRow> = {}): PlanCatalogueRow =>
  ({ id, name: id, monthly_price: price, quote: false, tagline: "", billdesk_seats: null, waiter_seats: null, admin_seats: 1, features: {}, active: true, sort: 0, ...extra });

describe("site models", () => {
  it("has one page per product, each with its own path", () => {
    expect(SITE_MODELS.map((m) => m.id).sort()).toEqual(PRODUCTS.map((p) => p.id).sort());
    expect(new Set(MODEL_PATHS).size).toBe(5);
  });
  it("only the live model is called live, and the channel manager is never live yet", () => {
    expect(SITE_MODELS.filter((m) => m.status === "live").map((m) => m.id)).toEqual(["restaurant_pos"]);
    for (const m of SITE_MODELS) for (const f of m.features) if (f.title === "Channel manager") expect(f.state).toBe("Rolling out");
  });
  it("never mentions aggregator commission stories", () => {
    expect(JSON.stringify(SITE_MODELS)).not.toMatch(/commission per order on Swiggy|aggregator's/i);
  });
});

describe("plans per model", () => {
  it("tells a plan's model from its id", () => {
    expect(planProduct("pro")).toBe("restaurant_pos");
    expect(planProduct("stay_pilot")).toBe("hostel_pos");
    expect(planProduct("hostel_starter")).toBe("hostel_pos");
    expect(planProduct("hotel_pro")).toBe("hotel_pos");
    expect(planProduct("resort_plus")).toBe("resort_pos");
    expect(planProduct("tourism_basic")).toBe("tourism_pos");
    expect(newPlanId("hostel_pos", "Starter Plus!")).toBe("hostel_starter_plus");
    expect(newPlanId("restaurant_pos", "Basic")).toBe("basic");
  });
  it("lists each model's own public plans, never the pilot row", () => {
    const rows = [row("basic"), row("stay_pilot", 0), row("hostel_starter", 999), row("hostel_old", 1, { active: false }), row("hotel_pro", 2999)];
    expect(modelPlanRows(rows, "hostel_pos").map((r) => r.id)).toEqual(["hostel_starter"]);
    expect(modelPlanRows(rows, "hotel_pos").map((r) => r.id)).toEqual(["hotel_pro"]);
    expect(modelPlanRows(rows, "resort_pos")).toEqual([]);
  });
  it("onboards each model only on its own plans", () => {
    expect(planFitsProduct("pro", "restaurant_pos")).toBe(true);
    expect(planFitsProduct("hostel_starter", "restaurant_pos")).toBe(false);
    expect(planFitsProduct("stay_pilot", "hostel_pos")).toBe(true);
    expect(planFitsProduct("hostel_starter", "hostel_pos")).toBe(true);
    expect(planFitsProduct("pro", "hostel_pos")).toBe(false);
    expect(planFitsProduct("hotel_pro", "hostel_pos")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { consoleHash, filterMatches, parseConsoleHash, productOf, PRODUCTS, restaurantMatches, sectionsFor } from "./products";
import { RESTAURANT_FEATURES, STAY_FEATURES, featureName, isStayPlan } from "./plans";

const RID = "66c66ac4-efce-492b-b709-1c2b38d9cd78";

describe("XTSY products", () => {
  it("only Restaurant POS is live", () => {
    expect(PRODUCTS.filter((p) => p.status === "live").map((p) => p.id)).toEqual(["restaurant_pos"]);
    expect(PRODUCTS.map((p) => p.id)).toEqual(expect.arrayContaining(["hotel_pos", "resort_pos", "hostel_pos"]));
  });
  it("outlets without a product are Restaurant POS", () => {
    expect(productOf(undefined)).toBe("restaurant_pos");
    expect(productOf("nonsense")).toBe("restaurant_pos");
    expect(productOf("hostel_pos")).toBe("hostel_pos");
  });
});

describe("console address", () => {
  it("round-trips product → restaurant → section", () => {
    for (const r of [{ tab: "plans" as const }, { tab: "products" as const, product: "restaurant_pos" as const }, { tab: "products" as const, product: "restaurant_pos" as const, restaurant: RID, section: "users" as const }]) {
      expect(parseConsoleHash(consoleHash(r))).toEqual("restaurant" in r ? r : r);
    }
    expect(consoleHash({ tab: "products", product: "restaurant_pos", restaurant: RID, section: "overview" })).toBe(`#products/restaurant_pos/${RID}`);
    expect(parseConsoleHash(`#products/restaurant_pos/${RID}`)).toEqual({ tab: "products", product: "restaurant_pos", restaurant: RID, section: "overview" });
  });
  it("keeps old links working and ignores junk", () => {
    expect(parseConsoleHash("#restaurants")).toEqual({ tab: "products", product: "restaurant_pos" });
    expect(parseConsoleHash("")).toEqual({ tab: "overview" });
    expect(parseConsoleHash("#nope")).toEqual({ tab: "overview" });
    expect(parseConsoleHash("#products/spaceship")).toEqual({ tab: "products" });
    expect(parseConsoleHash("#products/restaurant_pos/not-a-uuid")).toEqual({ tab: "products", product: "restaurant_pos" });
    expect(parseConsoleHash(`#products/restaurant_pos/${RID}/bogus`).section).toBe("overview");
  });
  it("searches and filters the list", () => {
    const r = { name: "TAB Bistro by XTSY", slug: "tab-bistro-qr", city: "New Shillong", planName: "Enterprise / Brand" };
    expect(restaurantMatches(r, "bistro")).toBe(true);
    expect(restaurantMatches(r, "shillong")).toBe(true);
    expect(restaurantMatches(r, "enterprise")).toBe(true);
    expect(restaurantMatches(r, "cafe")).toBe(false);
    expect(filterMatches({ live: true, status: "active" }, "live")).toBe(true);
    expect(filterMatches({ live: false, status: "suspended" }, "stopped")).toBe(true);
    expect(filterMatches({ live: true, status: "trialing" }, "trial")).toBe(true);
    expect(filterMatches({ live: true, status: "active" }, "due")).toBe(false);
  });
});

describe("per-product console and features", () => {
  const RID2 = "3bbdddb7-0000-4000-8000-000000000000";
  it("stays get the channel manager, restaurants get Swiggy & Zomato", () => {
    expect(sectionsFor("hostel_pos").map((s) => s.v)).toContain("channel");
    expect(sectionsFor("hostel_pos").map((s) => s.v)).not.toContain("integrations");
    expect(sectionsFor("restaurant_pos").map((s) => s.v)).toContain("integrations");
    expect(sectionsFor("restaurant_pos").map((s) => s.v)).not.toContain("channel");
    expect(parseConsoleHash(`#products/hostel_pos/${RID2}/integrations`).section).toBe("overview");
    expect(parseConsoleHash(`#products/restaurant_pos/${RID2}/channel`).section).toBe("overview");
    expect(parseConsoleHash(`#products/hostel_pos/${RID2}/channel`).section).toBe("channel");
  });
  it("feature sets don't cross products", () => {
    expect(RESTAURANT_FEATURES).not.toContain("pms");
    // Hostel POS is a PMS + channel manager + booking engine, not a restaurant platform: no café either.
    for (const f of ["aggregators", "waiter_app", "kds", "recipes", "bookings", "gift_cards", "online_ordering", "billing", "menu", "qr_ordering"] as const) expect(STAY_FEATURES).not.toContain(f);
    expect(STAY_FEATURES[0]).toBe("pms");
    expect(featureName("pms", true)).toMatch(/channel manager and booking engine/);
    expect(featureName("billing", false)).toBe("Billing, KOTs and tables");
    expect(isStayPlan("stay_pilot")).toBe(true);
    expect(isStayPlan("pro")).toBe(false);
  });
});


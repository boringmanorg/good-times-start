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
    expect(featureName("pms", true)).toMatch(/front desk/);
    expect(featureName("channel_manager", true)).toMatch(/Channel manager/);
    expect(featureName("billing", false)).toBe("Billing, KOTs and tables");
    expect(isStayPlan("stay_pilot")).toBe(true);
    expect(isStayPlan("pro")).toBe(false);
  });
});


describe("each model has its own device seats", () => {
  it("only Restaurant POS has Waiter Pro", async () => {
    const { seatAppsFor } = await import("./plans");
    expect(seatAppsFor("restaurant_pos").map(([a]) => a)).toEqual(["pos", "waiter", "manager"]);
    expect(seatAppsFor("hostel_pos")).toEqual([["pos", "Front Desk"], ["manager", "Property Manager"]]);
    expect(seatAppsFor("tourism_pos").map(([, n]) => n)).toEqual(["Booking desk", "Tour Manager"]);
  });
});

describe("each POS model has its own features and prices (27 Nov 2026)", async () => {
  const { HOSTEL_PLANS, PUBLIC_PLANS, RESTAURANT_FEATURES, STAY_ONLY, STAY_FEATURE_STATE, DEFAULT_OFF } = await import("./plans");
  it("Restaurant POS never shows a stay feature, Hostel plans never carry a restaurant one", () => {
    for (const f of STAY_ONLY) expect(RESTAURANT_FEATURES).not.toContain(f);
    for (const p of HOSTEL_PLANS) for (const f of ["billing", "menu", "waiter_app", "qr_ordering", "kds", "aggregators"] as const) expect(p.features).not.toContain(f);
    for (const p of HOSTEL_PLANS) expect(p.seats.waiter).toBe(0);
  });
  it("approved prices, and the hostel ladder only adds as you go up", () => {
    expect(PUBLIC_PLANS.map((p) => p.price)).toEqual([449, 899, 1299, 1999]);
    expect(HOSTEL_PLANS.map((p) => p.price)).toEqual([2299, 2899, 7999]);
    for (let i = 1; i < HOSTEL_PLANS.length; i++) for (const f of HOSTEL_PLANS[i - 1]!.features) expect(HOSTEL_PLANS[i]!.features).toContain(f);
  });
  it("the restaurant link is an add-on on no plan, off unless switched on; unshipped features are labelled", () => {
    for (const p of HOSTEL_PLANS) expect(p.features).not.toContain("restaurant_link");
    expect(DEFAULT_OFF).toContain("restaurant_link");
    expect(STAY_FEATURE_STATE.channel_manager).toBe("Rolling out");
    expect(STAY_FEATURE_STATE.booking_engine).toBe("Rolling out");
  });
});

describe("Hostel POS room pricing (owner, 27 Nov 2026)", async () => {
  const { HOSTEL_PLANS, stayPlanTotal, roomPriceText } = await import("./plans");
  const [essential, connect, group] = HOSTEL_PLANS;
  it("base price covers the included rooms; each room above adds ₹300", () => {
    expect(stayPlanTotal(essential!, 8)).toBe(2299);
    expect(stayPlanTotal(essential!, 10)).toBe(2899);
    expect(stayPlanTotal(connect!, 15)).toBe(2899);
    expect(stayPlanTotal(connect!, 20)).toBe(4399);
    expect(stayPlanTotal(essential!, 3)).toBe(2299);
  });
  it("Group is one price for up to 5 properties, 2 Property Manager devices each", () => {
    expect(stayPlanTotal(group!, 60)).toBe(7999);
    expect(group!.maxProperties).toBe(5);
    expect(group!.seats.manager).toBe(2);
    expect(roomPriceText(group!)).toBe("Up to 5 properties");
    expect(roomPriceText(essential!)).toBe("Up to 8 rooms · ₹300 a month per extra room");
  });
});

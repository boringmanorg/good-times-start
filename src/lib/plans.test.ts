import { describe, expect, it } from "vitest";
import { PUBLIC_PLANS, featureOn, priceText, seatText, subscriptionText, whatsappLink, type Entitlements } from "./plans";

const ent = (over: Partial<Entitlements> = {}): Entitlements => ({
  plan: "pro_lite", planName: "Pro Lite", price: 199, quote: false, status: "active", paidUntil: null, trialEndsAt: null, live: true, complimentary: false,
  features: { waiter_app: true, marketing: false }, seats: { pos: { limit: 5, used: 1 }, waiter: { limit: 2, used: 0 }, manager: { limit: 2, used: 1 } }, waiting: 0, ...over,
});

describe("plans", () => {
  it("publishes the four plans with their seats and prices", () => {
    expect(PUBLIC_PLANS.map((p) => [p.id, p.price, p.seats.pos, p.seats.waiter, p.seats.manager])).toEqual([
      ["basic", 99, 2, 0, 1], ["pro_lite", 199, 5, 2, 2], ["pro", 399, 10, 5, 5], ["enterprise", null, null, null, null],
    ]);
    expect(PUBLIC_PLANS.find((p) => p.id === "basic")?.features).not.toContain("waiter_app");
    expect(PUBLIC_PLANS.find((p) => p.id === "pro")?.features).toContain("waiter_app");
  });

  it("never locks a restaurant out when the plan is unknown", () => {
    expect(featureOn(null, "waiter_app")).toBe(true);
    expect(featureOn(ent(), "marketing")).toBe(false);
    expect(featureOn(ent(), "waiter_app")).toBe(true);
    expect(featureOn(ent(), "audit_log")).toBe(true); // not listed: on
  });

  it("words prices, seats and renewals", () => {
    expect(priceText(199)).toBe("₹199 / month");
    expect(priceText(null)).toBe("Call for quote");
    expect(seatText("pos", 1)).toBe("1 Billdesk user");
    expect(seatText("waiter", 0)).toBe("No Waiter users");
    expect(subscriptionText(ent({ complimentary: true }))).toBe("Pro Lite · complimentary");
    expect(subscriptionText(ent({ paidUntil: "2026-12-01T00:00:00Z" }), Date.parse("2026-11-13"))).toMatch(/renews 1 Dec 2026/);
    expect(subscriptionText(ent({ paidUntil: "2026-11-01T00:00:00Z" }), Date.parse("2026-11-13"))).toMatch(/renewal due since/);
    expect(whatsappLink("Hi & bye")).toBe("https://wa.me/918837317070?text=Hi%20%26%20bye");
  });
});

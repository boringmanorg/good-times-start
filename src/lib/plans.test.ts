import { describe, expect, it } from "vitest";
import { PUBLIC_PLANS, featureOn, priceText, seatText, subscriptionText, whatsappLink, type Entitlements } from "./plans";

const ent = (over: Partial<Entitlements> = {}): Entitlements => ({
  plan: "pro_lite", planName: "Pro Lite", price: 199, quote: false, status: "active", paidUntil: null, trialEndsAt: null, live: true, complimentary: false,
  features: { waiter_app: true, marketing: false }, seats: { pos: { limit: 5, used: 1 }, waiter: { limit: 2, used: 0 }, manager: { limit: 2, used: 1 } }, waiting: 0, ...over,
});

describe("plans", () => {
  it("publishes the four plans with their per-outlet prices and users", () => {
    expect(PUBLIC_PLANS.map((p) => [p.id, p.price, p.seats.pos, p.seats.waiter, p.seats.manager])).toEqual([
      ["basic", 149, 1, 0, 1], ["pro_lite", 299, 4, 0, 1], ["pro", 499, 6, 3, 2], ["enterprise", 999, null, null, 5],
    ]);
  });

  it("splits the features as XTSY sells them", () => {
    const f = (id: string) => PUBLIC_PLANS.find((p) => p.id === id)!.features;
    for (const id of ["basic", "pro_lite", "pro", "enterprise"]) expect(f(id)).toEqual(expect.arrayContaining(["billing", "menu", "gst_reports", "manager_app"]));
    for (const x of ["qr_ordering", "purchases", "vendors", "loyalty", "bookings", "waiter_app", "admin_approval"]) expect(f("basic")).not.toContain(x);
    expect(f("pro_lite")).toEqual(expect.arrayContaining(["purchases", "vendors", "loyalty", "bookings", "admin_approval", "insights"]));
    for (const x of ["qr_ordering", "waiter_app", "marketing"]) expect(f("pro_lite")).not.toContain(x);
    expect(f("pro")).toEqual(expect.arrayContaining(["waiter_app", "qr_ordering", "online_ordering", "marketing"]));
    expect(f("pro")).not.toContain("audit_log");
    expect(f("enterprise")).toContain("audit_log");
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
    expect(seatText("pos", null)).toBe("Unlimited Billdesk users");
    expect(subscriptionText(ent({ complimentary: true }))).toBe("Pro Lite · complimentary");
    expect(subscriptionText(ent({ paidUntil: "2026-12-01T00:00:00Z" }), Date.parse("2026-11-13"))).toMatch(/renews 1 Dec 2026/);
    expect(subscriptionText(ent({ paidUntil: "2026-11-01T00:00:00Z" }), Date.parse("2026-11-13"))).toMatch(/renewal due since/);
    expect(whatsappLink("Hi & bye")).toBe("https://wa.me/918837317070?text=Hi%20%26%20bye");
  });
});

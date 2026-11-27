import { describe, expect, it } from "vitest";
import { DEFAULT_OFF, PUBLIC_FEATURES, PUBLIC_PLANS, featureOn, priceText, seatText, subscriptionText, whatsappLink, type Entitlements } from "./plans";

const ent = (over: Partial<Entitlements> = {}): Entitlements => ({
  plan: "pro_lite", planName: "Pro Lite", price: 199, quote: false, status: "active", paidUntil: null, trialEndsAt: null, live: true, complimentary: false,
  features: { waiter_app: true, marketing: false }, seats: { pos: { limit: 5, used: 1 }, waiter: { limit: 2, used: 0 }, manager: { limit: 2, used: 1 } }, waiting: 0, ...over,
});

describe("plans", () => {
  // Standby copy only: the site reads the cloud catalogue and falls back to this (public-plans.ts).
  it("keeps the standby price list in step with the catalogue", () => {
    expect(PUBLIC_PLANS.map((p) => [p.id, p.price, p.seats.pos, p.seats.waiter, p.seats.manager])).toEqual([
      ["basic", 449, 1, 0, 1], ["pro_lite", 899, 3, 0, 1], ["pro", 1299, 6, 2, 2], ["enterprise", 1999, null, null, 4],
    ]);
  });

  // A plan must carry everything the cheaper plan does. Vendor management once went missing
  // from Pro while Enterprise kept it, so a Pro restaurant lost a feature by paying more.
  it("never takes a feature away as you move up the ladder", () => {
    for (let i = 1; i < PUBLIC_PLANS.length; i++) {
      const below = PUBLIC_PLANS[i - 1]!, above = PUBLIC_PLANS[i]!;
      const lost = below.features.filter((f) => !above.features.includes(f));
      expect(lost, `${above.name} is missing ${lost.join(", ")} which ${below.name} has`).toEqual([]);
    }
  });

  it("gives a waiter seat only to the plans that carry Waiter Pro", () => {
    for (const p of PUBLIC_PLANS) {
      expect(p.seats.waiter === 0).toBe(!p.features.includes("waiter_app"));
    }
  });

  it("splits the features as XTSY sells them", () => {
    const f = (id: string) => PUBLIC_PLANS.find((p) => p.id === id)!.features;
    for (const id of ["basic", "pro_lite", "pro", "enterprise"]) expect(f(id)).toEqual(expect.arrayContaining(["billing", "menu", "gst_reports", "manager_app"]));
    expect(f("basic")).toContain("insights"); // the sales dashboard is part of Basic
    for (const x of ["qr_ordering", "purchases", "vendors", "recipes", "loyalty", "bookings", "waiter_app", "admin_approval"]) expect(f("basic")).not.toContain(x);
    expect(f("pro_lite")).toEqual(expect.arrayContaining(["purchases", "vendors", "recipes", "loyalty", "bookings", "admin_approval", "insights"]));
    for (const x of ["qr_ordering", "waiter_app", "marketing", "gift_cards", "feedback"]) expect(f("pro_lite")).not.toContain(x);
    expect(f("pro")).toEqual(expect.arrayContaining(["waiter_app", "qr_ordering", "online_ordering", "marketing", "gift_cards", "feedback"]));
    for (const x of ["audit_log", "accounting"]) expect(f("pro")).not.toContain(x);
    expect(f("enterprise")).toEqual(expect.arrayContaining(["audit_log", "accounting"]));
    // The kitchen screen is switched on per restaurant by XTSY, so no plan carries it.
    for (const id of ["basic", "pro_lite", "pro", "enterprise"]) expect(f(id)).not.toContain("kds");
    expect(PUBLIC_FEATURES).not.toContain("kds");
  });

  it("never locks a restaurant out when the plan is unknown", () => {
    expect(featureOn(null, "waiter_app")).toBe(true);
    expect(featureOn(ent(), "marketing")).toBe(false);
    expect(featureOn(ent(), "waiter_app")).toBe(true);
    expect(featureOn(ent(), "audit_log")).toBe(true); // not listed: on
  });

  it("never switches on by itself a feature XTSY has to turn on", () => {
    for (const f of DEFAULT_OFF) {
      expect(featureOn(null, f)).toBe(false);
      expect(featureOn(ent(), f)).toBe(false); // not listed: off
      expect(featureOn(ent({ features: { [f]: true } }), f)).toBe(true);
    }
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

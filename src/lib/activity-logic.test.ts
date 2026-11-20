import { describe, expect, it } from "vitest";
import { activityDay, catalogueDrift, describeActivity, type ActivityEvent } from "./activity-logic";
import { FEATURES, PUBLIC_PLANS } from "./plans";

const plans = { basic: "Basic", pro_lite: "Pro Lite", pro: "Pro", enterprise: "Enterprise / Brand" };
const ev = (kind: string, detail: Record<string, unknown>): ActivityEvent => ({ id: 1, at: "2026-11-19T10:00:00Z", kind, detail });

describe("activity log in plain words", () => {
  it("reads a plan catalogue edit", () => {
    const l = describeActivity(ev("catalogue_changed", { plan: "basic", planName: "Basic", op: "update", changes: [
      { field: "monthly_price", from: 199, to: 249 }, { field: "feature:purchases", from: false, to: true }, { field: "feature:kds", from: true, to: false }] }), plans);
    expect(l?.title).toBe("Basic: price ₹199 → ₹249");
    expect(l?.details).toEqual(["Turned on: Purchases and spend analysis", "Turned off: Kitchen display screen"]);
    expect(l?.area).toBe("plans");
  });
  it("reads a subscription change and drops a save that changed nothing", () => {
    const same = { plan: "pro", status: "active", paidUntil: "2026-12-13T18:29:59+00:00", complimentary: false, features: {}, seats: {} };
    expect(describeActivity(ev("plan_changed", { from: same, to: same }), plans)).toBeNull();
    const l = describeActivity(ev("plan_changed", { from: same, to: { ...same, plan: "enterprise", complimentary: true, features: { kds: true } } }), plans);
    expect(l?.title).toBe("Subscription: plan Pro → Enterprise / Brand, made complimentary");
    expect(l?.details).toEqual(["Kitchen display screen: switched on for this outlet"]);
  });
  it("reads payments, logins, support, devices, Swiggy/Zomato", () => {
    expect(describeActivity(ev("payment_recorded", { amount: 999, months: 1, method: "upi", reference: "UTR1", until: "2027-01-13T00:00:00Z" }))?.title).toBe("Payment recorded: ₹999 by UPI for 1 month");
    expect(describeActivity(ev("login_changed", { action: "changed", email: "billdesk@xtsy.pos", password: "reset", signIn: "off" }))?.details).toEqual(["Password reset", "Sign-in switched off"]);
    expect(describeActivity(ev("support_sign_in", { email: "billdesk@xtsy.pos", role: "cashier", reason: "Sync check" }))?.title).toBe("Signed in as billdesk@xtsy.pos (Billdesk)");
    expect(describeActivity(ev("device_changed", { action: "blocked", device: "Counter 1" }))?.title).toBe("Device blocked: Counter 1");
    expect(describeActivity(ev("integration_changed", { platform: "swiggy", mode: "sandbox", store_id: "" }))?.title).toBe("Swiggy sandbox switched on");
    expect(describeActivity(ev("sandbox_order", { platform: "zomato", code: "ZO-0001", subtotal: 420 }))?.title).toBe("Zomato test order ZO-0001 sent · ₹420");
  });
  it("hides info saves with no change and warns on a QR address change", () => {
    const info = { name: "TAB", slug: "tab-bistro-qr", city: "" };
    expect(describeActivity(ev("info_changed", { from: info, to: info }))).toBeNull();
    const l = describeActivity(ev("info_changed", { from: info, to: { ...info, slug: "tab" } }));
    expect(l?.tone).toBe("warn");
    expect(l?.details[0]).toMatch(/QR cards/);
  });
  it("groups by India day", () => {
    const now = Date.parse("2026-11-20T00:30:00+05:30");
    expect(activityDay("2026-11-19T19:00:00Z", now)).toBe("Today");
    expect(activityDay("2026-11-19T10:00:00Z", now)).toBe("Yesterday");
  });
});

describe("catalogue drift against the ladder", () => {
  const ladder = Object.fromEntries(PUBLIC_PLANS.map((p) => [p.id, p.features as string[]]));
  const asCloud = PUBLIC_PLANS.map((p) => ({ id: p.id, name: p.name, features: Object.fromEntries(FEATURES.map((f) => [f, p.features.includes(f)])) }));
  it("is clean when the cloud matches", () => {
    expect(catalogueDrift(asCloud, ladder, FEATURES)).toEqual([]);
  });
  it("lists each difference", () => {
    const drifted = asCloud.map((p) => (p.id === "basic" ? { ...p, features: { ...p.features, purchases: true } } : p.id === "pro" ? { ...p, features: { ...p.features, gift_cards: false, kds: true } } : p));
    expect(catalogueDrift(drifted, ladder, FEATURES).map((d) => `${d.plan}:${d.feature}:${d.actual}`)).toEqual(["basic:purchases:true", "pro:gift_cards:false", "pro:kds:true"]);
  });
});

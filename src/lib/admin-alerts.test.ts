import { describe, expect, it } from "vitest";
import { adminAlerts, type AlertInput } from "./admin-alerts";

const base: AlertInput = { pendingTerminals: [], waitingForSeat: 0, pendingPurchases: [], qrOrders: 0, bookingRequests: 0, plan: null, now: Date.parse("2026-11-13T12:00:00Z") };

describe("admin alerts", () => {
  it("is quiet when nothing waits", () => {
    expect(adminAlerts(base)).toEqual([]);
    expect(adminAlerts({ ...base, plan: { name: "Pro", dueDate: Date.parse("2026-12-13"), lapsed: false, paused: false } })).toEqual([]);
  });

  it("lists everything waiting on the admin, urgent first", () => {
    const list = adminAlerts({
      ...base,
      pendingTerminals: [{ device_id: "d1", app: "pos", login_email: "billdesk@xtsy.pos" }],
      waitingForSeat: 2,
      pendingPurchases: [{ id: "p1", returns: false, amount: 1200 }, { id: "p2", returns: true, amount: -300 }],
      qrOrders: 3,
      bookingRequests: 1,
      plan: { name: "Pro", dueDate: Date.parse("2026-11-15T12:00:00Z"), lapsed: false, paused: false },
    });
    expect(list.map((a) => a.title)).toEqual([
      "New POS Billdesk wants to join", "2 purchases to approve", "3 QR orders waiting", "1 table booking request",
      "2 devices waiting for a free place", "Pro renews in 2 days",
    ]);
    expect(list[1]?.detail).toMatch(/1 supplier return included · ₹1,500 in all/);
    expect(list[0]?.action).toEqual({ to: "/settings", hash: "terminals" });
  });

  it("flags a lapsed or paused plan", () => {
    expect(adminAlerts({ ...base, plan: { name: "Basic", dueDate: null, lapsed: true, paused: false } })[0]?.title).toBe("Basic renewal overdue");
    expect(adminAlerts({ ...base, plan: { name: "Basic", dueDate: null, lapsed: false, paused: true } })[0]?.title).toBe("Basic plan is paused");
  });

  it("gives each waiting thing a stable id so it alerts once", () => {
    const a = adminAlerts({ ...base, pendingTerminals: [{ device_id: "d1", app: "waiter", login_email: "" }] });
    const b = adminAlerts({ ...base, pendingTerminals: [{ device_id: "d1", app: "waiter", login_email: "" }] });
    expect(a[0]?.id).toBe(b[0]?.id);
  });
});

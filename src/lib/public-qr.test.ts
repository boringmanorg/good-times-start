import { describe, expect, it } from "vitest";
import { entryQrUrls, guestEntry, isPublicOrderType, needsTableOnAccept, orderTypeFor, publicOrderNote, seatingChoices } from "./guest-order-logic";
import { BOOKING_MAX_PARTY, bookingRequestError, bookingStatusText } from "./reservations";

describe("two QR codes", () => {
  it("in-house QR shows the room picker; anything else is the public QR", () => {
    expect(guestEntry({ for: "stay" })).toBe("inhouse");
    expect(guestEntry({})).toBe("public");
    expect(guestEntry({ for: "other" })).toBe("public");
  });
  it("builds both shareable links on the live site", () => {
    const u = entryQrUrls("https://good-times-start.lovable.app", "tab-bistro-qr");
    expect(u.inhouse).toBe("https://good-times-start.lovable.app/order/tab-bistro-qr?s=stay&for=stay");
    expect(u.public).toBe("https://good-times-start.lovable.app/order/tab-bistro-qr?s=public");
  });
});

describe("public QR orders", () => {
  it("accepts only dine-in, takeaway and delivery", () => {
    expect(["dine-in", "takeaway", "delivery"].every(isPublicOrderType)).toBe(true);
    expect(isPublicOrderType("table")).toBe(false);
  });
  it("prices by what the guest picked; a table or room QR is always dine-in", () => {
    expect(orderTypeFor("online", "delivery")).toBe("delivery");
    expect(orderTypeFor("online", "dine-in")).toBe("dine-in");
    expect(orderTypeFor("online", null)).toBe("takeaway");
    expect(orderTypeFor("table", "delivery")).toBe("dine-in");
  });
  it("a public dine-in order needs staff to choose the table; others don't", () => {
    expect(needsTableOnAccept({ channel: "online", order_type: "dine-in" })).toBe(true);
    expect(needsTableOnAccept({ channel: "online", order_type: "delivery" })).toBe(false);
    expect(needsTableOnAccept({ channel: "table", order_type: null })).toBe(false);
  });
  it("puts the delivery address, seating or pickup time on the kitchen ticket", () => {
    const base = { code: "W-1234", channel: "online" as const, pickup_at: null, note: "" };
    expect(publicOrderNote({ ...base, order_type: "delivery", delivery_address: "House 12, Mawdiangdiang Road", delivery_landmark: "NIFT gate" }))
      .toBe("W-1234 delivery to House 12, Mawdiangdiang Road, near NIFT gate");
    expect(publicOrderNote({ ...base, order_type: "dine-in", note: "Party of 4" })).toBe("W-1234 dine-in: Party of 4");
    expect(publicOrderNote({ ...base, order_type: "takeaway" })).toBe("W-1234 pickup");
    expect(publicOrderNote({ ...base, channel: "table", order_type: null })).toBe("");
  });
  it("offers staff only dining tables to seat a guest, free ones first", () => {
    const seats = seatingChoices([
      { id: "ROOM-1", label: "Room 1", section: "Rooms", seats: 2 },
      { id: "D1", label: "D1", section: "Dine-in", seats: 2, status: "occupied" },
      { id: "D2", label: "D2", section: "Dine-in", seats: 2, status: "free" },
      { id: "B1", label: "Bonfire 1", section: "Dine-in", seats: 8 },
    ]);
    expect(seats.map((s) => s.id)).toEqual(["B1", "D2", "D1"]);
    expect(seats.find((s) => s.id === "D1")?.busy).toBe(true);
  });
});

describe("table booking without choosing a table", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("allows 1 to 15 guests, in the future, for 1 to 6 hours", () => {
    expect(bookingRequestError(now + 3600_000, 2, 15, now)).toBeNull();
    expect(bookingRequestError(now + 3600_000, 2, BOOKING_MAX_PARTY + 1, now)).toMatch(/1 to 15 guests/);
    expect(bookingRequestError(now - 60_000, 2, 4, now)).toMatch(/future/);
    expect(bookingRequestError(now + 3600_000, 8, 4, now)).toMatch(/1 to 6 hours/);
  });
  it("names the table to the guest only once staff allot it", () => {
    expect(bookingStatusText({ status: "pending", table_label: null }).title).toBe("Request received.");
    expect(bookingStatusText({ status: "confirmed", table_label: "Bonfire 1" }).body).toContain("Bonfire 1");
  });
});

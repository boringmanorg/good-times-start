import { describe, expect, it } from "vitest";
import { cleanMapLink, guestRequired, mapPinUrl, pinCoords, publicTypeFrom, splitMapPin, withMapPin, publicOrderNote } from "./guest-order-logic";

describe("guest checkout rules", () => {
  it("public QR opens as dine-in unless the guest picked another type", () => {
    expect(publicTypeFrom(undefined)).toBe("dine-in");
    expect(publicTypeFrom("delivery")).toBe("delivery");
    expect(publicTypeFrom("nonsense")).toBe("dine-in");
  });

  it("in-house guests must give room, name and mobile", () => {
    expect(guestRequired({ stay: true, roomTable: false, channel: "table", kind: null })).toMatchObject({ room: true, name: true, phone: true, party: false, pickup: false, pin: false });
  });

  it("a room QR card also asks for name and mobile, but the room is already known", () => {
    expect(guestRequired({ stay: false, roomTable: true, channel: "table", kind: null })).toMatchObject({ room: false, name: true, phone: true });
  });

  it("a dining-table QR keeps name and mobile optional", () => {
    expect(guestRequired({ stay: false, roomTable: false, channel: "table", kind: null })).toMatchObject({ name: false, phone: false, room: false });
  });

  it("public dine-in needs guests, name and mobile; takeaway needs an arrival time; delivery needs address and pin", () => {
    expect(guestRequired({ stay: false, roomTable: false, channel: "online", kind: "dine-in" })).toMatchObject({ name: true, phone: true, party: true, pickup: false, address: false });
    expect(guestRequired({ stay: false, roomTable: false, channel: "online", kind: "takeaway" })).toMatchObject({ pickup: true, party: false, pin: false });
    expect(guestRequired({ stay: false, roomTable: false, channel: "online", kind: "delivery" })).toMatchObject({ address: true, pin: true, pickup: false });
  });

  it("map pins round-trip through the stored address and stay inside 240 characters", () => {
    const pin = mapPinUrl(25.6025457, 91.9448902);
    expect(pin).toBe("https://maps.google.com/?q=25.602546,91.944890");
    expect(pinCoords(pin)).toEqual({ lat: 25.602546, lng: 91.94489 });
    const stored = withMapPin("XTSY Travellers Hostel, Mawdiangdiang Road", pin);
    expect(splitMapPin(stored)).toEqual({ address: "XTSY Travellers Hostel, Mawdiangdiang Road", pin });
    expect(withMapPin("x".repeat(300), pin).length).toBeLessThanOrEqual(240);
    expect(splitMapPin("No pin here")).toEqual({ address: "No pin here", pin: null });
  });

  it("accepts shared Google Maps links and rejects anything else", () => {
    expect(cleanMapLink("Check https://maps.app.goo.gl/UnP9PfbSJdafMFMM6 thanks")).toBe("https://maps.app.goo.gl/UnP9PfbSJdafMFMM6");
    expect(cleanMapLink("https://www.google.com/maps/place/X/@25.6,91.9,17z")).toContain("google.com/maps");
    expect(cleanMapLink("https://evil.example/maps")).toBeNull();
  });

  it("kitchen note shows the address without the pin link", () => {
    const note = publicOrderNote({ code: "Q-1", channel: "online", order_type: "delivery", pickup_at: null, note: "", delivery_address: withMapPin("House 4, NIFT Road", mapPinUrl(25.6, 91.9)), delivery_landmark: null });
    expect(note).toBe("Q-1 delivery to House 4, NIFT Road");
  });
});

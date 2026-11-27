import { describe, expect, it } from "vitest";
import type { Stay, Unit, UnitType } from "../pms/types";
import {
  ariFor,
  buildPartnerStay,
  cancelPartnerStay,
  changePartnerStay,
  isPartnerKeyShape,
  newPartnerKey,
  parsePartnerBooking,
  sampleRooms,
  signWebhook,
  stayForChannel,
  webhookUrlProblem,
  type PartnerBooking,
} from "./core";

let n = 0;
const ids = () => `id${++n}`;
const { types, units } = sampleRooms(ids) as { types: UnitType[]; units: Unit[] };
const dorm = types[0]!;
const today = "2026-12-01";
const ctx = (stays: Stay[] = []) => ({
  types,
  units,
  stays,
  today,
  now: 1,
  id: `s${++n}`,
  by: "sandbox:Booking.com",
  random: () => 0.1,
});
const booking = (over: Partial<PartnerBooking> = {}): PartnerBooking => ({
  channel: "booking_com",
  channelBookingId: "BK-1",
  checkIn: "2026-12-10",
  checkOut: "2026-12-12",
  guest: { name: "Asha Rao", phone: "+919876543210" },
  rooms: [{ roomTypeId: dorm.id, units: 2, guests: 2 }],
  ...over,
});

describe("sandbox bookings", () => {
  it("validates the API body", () => {
    expect(parsePartnerBooking({}).ok).toBe(false);
    expect(parsePartnerBooking({ ...booking(), channel: "trivago" }).ok).toBe(false);
    expect(parsePartnerBooking({ ...booking(), guest: { name: "A", phone: "1" } }).ok).toBe(false);
    expect(parsePartnerBooking(booking()).ok).toBe(true);
  });

  it("prices from the PMS, gives beds and marks it as a sandbox OTA booking", () => {
    const r = buildPartnerStay(booking(), ctx());
    if ("error" in r) throw new Error(r.error);
    expect(r.stay.source).toBe("ota");
    expect(r.stay.ota).toEqual({ name: "Booking.com", bookingId: "BK-1" });
    expect(r.stay.sandbox).toBe(true);
    expect(r.stay.lines[0]!.rate).toBe(400);
    expect(r.stay.lines[0]!.unitIds).toHaveLength(2);
  });

  it("uses the rate plan's price and refuses closed or restricted dates", () => {
    const r = buildPartnerStay(
      booking({ rooms: [{ roomTypeId: dorm.id, planId: "breakfast", units: 1, guests: 1 }] }),
      ctx(),
    );
    if ("error" in r) throw new Error(r.error);
    expect(r.stay.lines[0]!.rate).toBe(550);
    const closed = { ...dorm, calendar: { "2026-12-10": { closed: true } } };
    const refused = buildPartnerStay(booking(), { ...ctx(), types: [closed, ...types.slice(1)] });
    expect("error" in refused && refused.error).toMatch(/closed to sale/);
    const minStay = { ...dorm, calendar: { "2026-12-10": { minStay: 3 } } };
    expect(
      "error" in buildPartnerStay(booking(), { ...ctx(), types: [minStay, ...types.slice(1)] }),
    ).toBe(true);
  });

  it("refuses when not enough beds are free, counting nights sold elsewhere", () => {
    const held = { ...dorm, calendar: { "2026-12-10": { held: 7 } } };
    const r = buildPartnerStay(booking(), { ...ctx(), types: [held, ...types.slice(1)] });
    expect("error" in r && r.error).toMatch(/not enough free/);
  });

  it("finds a repeated booking by channel and booking id", () => {
    const r = buildPartnerStay(booking(), ctx());
    if ("error" in r) throw new Error(r.error);
    expect(stayForChannel([r.stay], "booking_com", "BK-1")?.id).toBe(r.stay.id);
    expect(stayForChannel([r.stay], "agoda", "BK-1")).toBeUndefined();
  });

  it("changes dates, keeping the same beds when free, and cancels with a reason", () => {
    const r = buildPartnerStay(booking(), ctx());
    if ("error" in r) throw new Error(r.error);
    const moved = changePartnerStay(
      r.stay,
      { checkOut: "2026-12-13" },
      { types, units, stays: [r.stay], today, now: 2, by: "x" },
    );
    if ("error" in moved) throw new Error(moved.error);
    expect(moved.stay.checkOut).toBe("2026-12-13");
    expect(moved.stay.lines[0]!.unitIds).toEqual(r.stay.lines[0]!.unitIds);
    expect(moved.stay.history?.at(-1)?.what).toMatch(/Changed dates/);
    expect("error" in cancelPartnerStay(r.stay, "no", { now: 3, by: "x" })).toBe(true);
    const c = cancelPartnerStay(r.stay, "Guest cancelled on Booking.com", { now: 3, by: "x" });
    if ("error" in c) throw new Error(c.error);
    expect(c.stay.status).toBe("cancelled");
    const inHouse = { ...r.stay, status: "checked_in" as const };
    expect(
      "error" in
        changePartnerStay(
          inHouse,
          { checkOut: "2026-12-14" },
          { types, units, stays: [inHouse], today, now: 4, by: "x" },
        ),
    ).toBe(true);
  });

  it("shows availability, rates and restrictions per night", () => {
    const r = buildPartnerStay(booking(), ctx());
    if ("error" in r) throw new Error(r.error);
    const typesWithCta = [
      { ...dorm, calendar: { "2026-12-11": { cta: true, minStay: 2 } } },
      ...types.slice(1),
    ];
    const out = ariFor(typesWithCta, units, [r.stay], "2026-12-10", 3);
    const d = out.find((t) => t.roomTypeId === dorm.id)!;
    expect(d.nights.map((x) => x.available)).toEqual([6, 6, 8]);
    expect(d.nights[1]).toMatchObject({ closedToArrival: true, minStay: 2 });
    expect(d.nights[0]!.plans.find((p) => p.id === "nonref")!.rate).toBe(360);
  });
});

describe("sandbox keys and webhooks", () => {
  it("makes keys of a fixed shape", () => {
    const k = newPartnerKey();
    expect(isPartnerKeyShape(k)).toBe(true);
    expect(isPartnerKeyShape("xsb_live_abc")).toBe(false);
  });
  it("signs webhooks with HMAC-SHA256 over timestamp and body", async () => {
    const sig = await signWebhook("whsec_test", 1700000000, '{"a":1}');
    expect(sig).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(await signWebhook("whsec_test", 1700000000, '{"a":1}')).toBe(sig);
    expect(await signWebhook("whsec_other", 1700000000, '{"a":1}')).not.toBe(sig);
  });
  it("sends webhooks only to public https addresses", () => {
    expect(webhookUrlProblem("https://partner.example.com/hooks/xtsy")).toBeNull();
    expect(webhookUrlProblem("http://partner.example.com")).not.toBeNull();
    expect(webhookUrlProblem("https://localhost/x")).not.toBeNull();
    expect(webhookUrlProblem("https://10.0.0.5/x")).not.toBeNull();
    expect(webhookUrlProblem("https://192.168.1.2/x")).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { rateSuggestions, roundRate, stayInsights, suggestFor, weekdayOf } from "./smart";
import type { Stay, Unit, UnitType } from "./types";

const dorm: UnitType = { id: "dorm", name: "Dorm bed", soldAs: "bed", rate: 500, maxGuests: 1, femaleOnly: false, gst: "auto", order: 1 };
const units: Unit[] = "ABCDEFGHIJ".split("").map((l) => ({ id: l, typeId: "dorm", label: l, room: "Room 8", housekeeping: "clean" }));
let n = 0;
const stay = (checkIn: string, checkOut: string, beds: number, p: Partial<Stay> = {}): Stay => ({
  id: `s${++n}`, reference: `STY-${n}`, source: "walk_in", status: "booked", checkIn, checkOut,
  guest: { name: "Guest", phone: "9876543210" }, lines: [{ typeId: "dorm", units: beds, guests: beds, rate: 500, unitIds: [] }],
  charges: [], payments: [], createdAt: 0, createdBy: "desk", ...p,
} as Stay);

// 2026-12-01 is a Tuesday; 12-04 Friday, 12-05 Saturday.
const TODAY = "2026-12-01";

describe("rate suggestions", () => {
  it("rounds like a price list", () => {
    expect(roundRate(553)).toBe(550);
    expect(roundRate(2420)).toBe(2400);
    expect(weekdayOf("2026-12-04")).toBe(5);
  });
  it("raises busy nights, more on weekends, never past the cap", () => {
    const cell = (night: string, sold: number) => ({ night, sold, free: 10 - sold, rate: 500, closed: false });
    expect(suggestFor(500, cell("2026-12-10", 9), 10, TODAY)).toMatchObject({ suggested: 600, occupancyPct: 90 });
    expect(suggestFor(500, cell("2026-12-10", 7), 10, TODAY)?.suggested).toBe(550);
    expect(suggestFor(500, cell("2026-12-11", 7), 10, TODAY)).toMatchObject({ suggested: 600, reason: "70% full · weekend" });
    expect(suggestFor(500, cell("2026-12-10", 5), 10, TODAY)).toBeNull();
  });
  it("trims close-in empty nights but not far-off ones", () => {
    const cell = (night: string) => ({ night, sold: 1, free: 9, rate: 500, closed: false });
    expect(suggestFor(500, cell("2026-12-02"), 10, TODAY)?.suggested).toBe(450);
    expect(suggestFor(500, cell("2026-12-20"), 10, TODAY)).toBeNull();
  });
  it("leaves closed, sold-out and already-set nights alone", () => {
    expect(suggestFor(500, { night: "2026-12-10", sold: 9, free: 1, rate: 500, closed: true }, 10, TODAY)).toBeNull();
    expect(suggestFor(500, { night: "2026-12-10", sold: 10, free: 0, rate: 500, closed: false }, 10, TODAY)).toBeNull();
    expect(suggestFor(500, { night: "2026-12-10", sold: 9, free: 1, rate: 600, closed: false }, 10, TODAY)).toBeNull();
    // A weekend already raised by hand above the suggestion stays as it is.
    expect(suggestFor(2400, { night: "2026-12-04", sold: 1, free: 1, rate: 2900, closed: false }, 2, TODAY)).toBeNull();
  });
  it("reads the property's own bookings", () => {
    const stays = [stay("2026-12-10", "2026-12-11", 9), stay("2026-12-02", "2026-12-03", 1)];
    const s = rateSuggestions([dorm], units, stays, TODAY, 14);
    expect(s.map((x) => [x.night, x.suggested])).toEqual(expect.arrayContaining([["2026-12-10", 600], ["2026-12-02", 450]]));
    expect(s[0]!.night <= s[s.length - 1]!.night).toBe(true);
  });
});

describe("insights", () => {
  const now = Date.parse("2026-12-01T12:00:00Z");
  it("flags slow nights, sell-outs, pickup and money to collect", () => {
    const stays = [
      stay("2026-12-08", "2026-12-09", 10, { createdAt: now - 86_400_000 }),
      stay("2026-12-01", "2026-12-03", 1, { status: "checked_in", createdAt: now - 10 * 86_400_000 }),
    ];
    const ins = stayInsights([dorm], units, stays, TODAY, now);
    const ids = ins.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["slow", "full", "pickup", "owed"]));
    expect(ins.find((i) => i.id === "pickup")!.detail).toBe("Up from 1 the week before.");
    expect(ins.find((i) => i.id === "owed")!.title).toMatch(/^₹1,000 still to collect/);
  });
  it("notices heavy booking-site dependence", () => {
    const stays = [1, 2, 3, 4].map((i) => stay("2026-12-20", "2026-12-21", 1, { source: "ota", createdAt: now - i * 86_400_000 }));
    expect(stayInsights([dorm], units, stays, TODAY, now).some((i) => i.id === "ota")).toBe(true);
  });
  it("says nothing without rooms", () => {
    expect(stayInsights([dorm], [], [], TODAY, now)).toEqual([]);
  });
});

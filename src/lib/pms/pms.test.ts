import { describe, expect, it } from "vitest";
import { addDays, nightsOf } from "./dates";
import { advanceFor, folioOf, stayGstPct } from "./folio";
import { clashes, freeForStay, pickUnits, unitsFreeFor } from "./inventory";
import { deskDay, stayStats } from "./reports";
import { bookingProblems, canCancel, canCheckIn, canCheckOut, canMarkNoShow, formIIIDue } from "./stay-flow";
import type { Stay, Unit, UnitType } from "./types";

const types: UnitType[] = [
  { id: "dorm8", name: "Bed in 8 Bed Mixed Dormitory", soldAs: "bed", rate: 400, maxGuests: 1, femaleOnly: false, gst: "auto", order: 1 },
  { id: "fem4", name: "Bed in 4 Bed Female Deluxe Dormitory", soldAs: "bed", rate: 600, maxGuests: 1, femaleOnly: true, gst: "auto", order: 2 },
  { id: "king", name: "King Room with Mountain View", soldAs: "room", rate: 2400, maxGuests: 2, femaleOnly: false, gst: "auto", order: 3 },
  { id: "exp", name: "Experience by XTSY", soldAs: "room", rate: 4999, maxGuests: 2, femaleOnly: false, gst: "auto", order: 4 },
];
const bed = (room: string, l: string, typeId = "dorm8"): Unit => ({ id: `${room}${l}`, typeId, label: `${room}${l}`, room: `Room ${room}`, housekeeping: "clean" });
const units: Unit[] = [
  ..."ABCDEFGH".split("").map((l) => bed("8", l)),
  bed("9", "A", "fem4"), bed("9", "B", "fem4"),
  { id: "K1", typeId: "king", label: "11", room: "Room 11", housekeeping: "clean" },
  { id: "K2", typeId: "king", label: "12", room: "Room 12", housekeeping: "clean" },
  { id: "666", typeId: "exp", label: "666", room: "Room 666", housekeeping: "clean" },
];
let n = 0;
const stay = (p: Partial<Stay>): Stay => ({
  id: `s${++n}`, reference: `STY/${String(n).padStart(4, "0")}`, source: "walk_in", status: "booked",
  checkIn: "2026-12-01", checkOut: "2026-12-03", guest: { name: "Asha", phone: "9876543210", idSeen: "Aadhaar" },
  lines: [{ typeId: "dorm8", units: 1, guests: 1, rate: 400, unitIds: [] }], charges: [], payments: [],
  createdAt: 0, createdBy: "desk", ...p,
});

describe("dates", () => {
  it("counts nights, not days", () => {
    expect(nightsOf("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(nightsOf("2026-12-03", "2026-12-03")).toEqual([]);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("stay GST", () => {
  it("follows the tariff per unit per night", () => {
    expect(stayGstPct(1000)).toBe(0);
    expect(stayGstPct(1001)).toBe(5);
    expect(stayGstPct(7500)).toBe(5);
    expect(stayGstPct(7501)).toBe(18);
    expect(stayGstPct(400, "5")).toBe(5);
  });
});

describe("inventory", () => {
  it("counts bookings without beds against what's on sale", () => {
    const stays = [stay({ lines: [{ typeId: "dorm8", units: 3, guests: 3, rate: 400, unitIds: [] }] })];
    expect(freeForStay(types[0]!, units, stays, "2026-12-01", "2026-12-02")).toBe(5);
    expect(freeForStay(types[0]!, units, stays, "2026-12-03", "2026-12-04")).toBe(8);
  });
  it("an out-of-order bed is not sold", () => {
    const u = units.map((x) => (x.id === "8A" ? { ...x, housekeeping: "out_of_order" as const } : x));
    expect(freeForStay(types[0]!, u, [], "2026-12-01", "2026-12-02")).toBe(7);
  });
  it("cancelled stays give their nights back", () => {
    const stays = [stay({ status: "cancelled", lines: [{ typeId: "king", units: 2, guests: 2, rate: 2400, unitIds: [] }] })];
    expect(freeForStay(types[2]!, units, stays, "2026-12-01", "2026-12-03")).toBe(2);
  });
  it("keeps a group in one room, lowest number first", () => {
    const free = [bed("7", "A"), bed("7", "B"), bed("5", "C"), bed("5", "D"), bed("5", "E")];
    expect(pickUnits(free, 2)!.map((u) => u.label)).toEqual(["5C", "5D"]);
    expect(pickUnits(free, 3)!.map((u) => u.label)).toEqual(["5C", "5D", "5E"]);
    expect(pickUnits(free, 4)!.length).toBe(4);
    expect(pickUnits(free, 6)).toBeNull();
  });
  it("skips beds taken on any of the nights", () => {
    const stays = [stay({ checkIn: "2026-12-02", checkOut: "2026-12-04", lines: [{ typeId: "dorm8", units: 1, guests: 1, rate: 400, unitIds: ["8A"] }] })];
    expect(unitsFreeFor("dorm8", units, stays, "2026-12-01", "2026-12-03").map((u) => u.label)).not.toContain("8A");
    expect(unitsFreeFor("dorm8", units, stays, "2026-12-04", "2026-12-05").map((u) => u.label)).toContain("8A");
  });
  it("finds two stays on one bed", () => {
    const a = stay({ lines: [{ typeId: "dorm8", units: 1, guests: 1, rate: 400, unitIds: ["8B"] }] });
    const b = stay({ checkIn: "2026-12-02", checkOut: "2026-12-05", lines: [{ typeId: "dorm8", units: 1, guests: 1, rate: 400, unitIds: ["8B"] }] });
    expect(clashes([a, b])).toEqual([{ unitId: "8B", night: "2026-12-02", stayIds: [a.id, b.id] }]);
  });
});

describe("booking", () => {
  it("refuses an overbooking and a female-only bed for a mixed group", () => {
    const full = [stay({ lines: [{ typeId: "exp", units: 1, guests: 2, rate: 4999, unitIds: [] }] })];
    const s = stay({ lines: [{ typeId: "exp", units: 1, guests: 2, rate: 4999, unitIds: [] }] });
    expect(bookingProblems(s, types, units, [...full, s])).toContain("Experience by XTSY: not enough free for these dates.");
    const f = stay({ femaleGuests: 0, lines: [{ typeId: "fem4", units: 1, guests: 1, rate: 600, unitIds: [] }] });
    expect(bookingProblems(f, types, units, [f])).toContain("Bed in 4 Bed Female Deluxe Dormitory is for women only.");
    const ok = stay({ femaleGuests: 1, lines: [{ typeId: "fem4", units: 1, guests: 1, rate: 600, unitIds: [] }] });
    expect(bookingProblems(ok, types, units, [ok])).toEqual([]);
  });
  it("checks guests fit the rooms", () => {
    const s = stay({ lines: [{ typeId: "king", units: 1, guests: 3, rate: 2400, unitIds: [] }] });
    expect(bookingProblems(s, types, units, [s])).toContain("King Room with Mountain View: 1 hold up to 2 guest(s).");
  });
});

describe("folio", () => {
  it("adds room nights, GST, extras and payments", () => {
    const s = stay({
      lines: [{ typeId: "exp", units: 1, guests: 2, rate: 4999, unitIds: ["666"] }],
      charges: [{ id: "c", label: "Bonfire kit", amount: 300, gstPct: 18, at: 0, by: "desk" }],
      payments: [{ id: "p", kind: "advance", amount: 2700, mode: "upi", at: 0, by: "desk" }],
    });
    const f = folioOf(s, types);
    expect(f.lines[0]).toMatchObject({ taxable: 9998, gstPct: 5, gst: 499.9 });
    expect(f.total).toBe(Math.round(9998 + 499.9 + 300 + 54));
    expect(f.due).toBe(f.total - 2700);
    expect(advanceFor(f.total)).toBe(Math.ceil(f.total / 4));
  });
  it("dorm beds at ₹1,000 or less carry no GST", () => {
    expect(folioOf(stay({}), types).gst).toBe(0);
  });
});

describe("check-in and check-out", () => {
  const ready = () => stay({ lines: [{ typeId: "king", units: 1, guests: 2, rate: 2400, unitIds: ["K1"] }] });
  it("needs beds given, rooms clean and the ID noted", () => {
    expect(canCheckIn(stay({}), units, "2026-12-01")).toBe("Give every guest a bed or room first.");
    expect(canCheckIn(ready(), units, "2026-11-30")).toBe("Arrives on 2026-12-01.");
    const dirty = units.map((u) => (u.id === "K1" ? { ...u, housekeeping: "dirty" as const } : u));
    expect(canCheckIn(ready(), dirty, "2026-12-01")).toBe("11 isn't clean yet.");
    expect(canCheckIn({ ...ready(), guest: { name: "A", phone: "9876543210" } }, units, "2026-12-01")).toBe("Note which ID the guest showed.");
    expect(canCheckIn(ready(), units, "2026-12-01")).toBeNull();
  });
  it("needs the folio settled and the restaurant bills closed", () => {
    const inHouse = { ...ready(), status: "checked_in" as const };
    expect(canCheckOut(inHouse, types, 1)).toMatch(/still open on the room/);
    expect(canCheckOut(inHouse, types, 0)).toMatch(/is still due/);
    const total = folioOf(inHouse, types).total;
    expect(canCheckOut({ ...inHouse, payments: [{ id: "p", kind: "payment", amount: total, mode: "cash", at: 0, by: "d" }] }, types, 0)).toBeNull();
  });
  it("cancel needs a reason; no-show only after the arrival day", () => {
    expect(canCancel(stay({}), "")).toMatch(/Say why/);
    expect(canMarkNoShow(stay({}), "2026-12-01")).toMatch(/day after/);
    expect(canMarkNoShow(stay({}), "2026-12-02")).toBeNull();
  });
  it("flags Form-III for a foreign guest within 24 hours", () => {
    const s = { ...stay({ guest: { name: "Ana", phone: "+34 600 000 000", nationality: "ES", idSeen: "Passport" } }), status: "checked_in" as const, checkedInAt: 0 };
    expect(formIIIDue(s, 3_600_000)).toEqual({ overdue: false, dueAt: 86_400_000 });
    expect(formIIIDue(s, 90_000_000)!.overdue).toBe(true);
    expect(formIIIDue({ ...s, formIII: { at: 1, by: "d" } }, 90_000_000)).toBeNull();
  });
});

describe("reports", () => {
  it("reads the desk day and occupancy", () => {
    const a = stay({ checkIn: "2026-12-01", checkOut: "2026-12-02", lines: [{ typeId: "king", units: 1, guests: 2, rate: 2400, unitIds: ["K1"] }] });
    const b = { ...stay({ checkIn: "2026-11-30", checkOut: "2026-12-01" }), status: "checked_in" as const };
    const day = deskDay([a, b], "2026-12-01");
    expect(day.arrivals).toEqual([a]);
    expect(day.departures).toEqual([b]);
    const st = stayStats([a], units, "2026-12-01", "2026-12-02");
    expect(st).toMatchObject({ unitNights: 13, soldNights: 1, roomRevenue: 2400, adr: 2400 });
    expect(st.revpar).toBeCloseTo(2400 / 13, 2);
  });
});

import { expandLabels } from "./setup-logic";
describe("setup labels", () => {
  it("expands ranges", () => {
    expect(expandLabels("8A-8H")).toEqual(["8A", "8B", "8C", "8D", "8E", "8F", "8G", "8H"]);
    expect(expandLabels("4A - D")).toEqual(["4A", "4B", "4C", "4D"]);
    expect(expandLabels("11-13, 666")).toEqual(["11", "12", "13", "666"]);
    expect(expandLabels("")).toEqual([]);
  });
});

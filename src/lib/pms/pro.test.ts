import { describe, expect, it } from "vitest";
import { auditChecks, auditSummary, housekeepingBoard } from "./day";
import { invoiceHtml } from "./invoice";
import {
  applyRestrictions,
  cleanPlans,
  planRateOn,
  plansOf,
  quotePlan,
  restrictionProblems,
} from "./plans";
import { moveStay, tapeBars, tapeRows, unassignedIn } from "./tape";
import type { Stay, Unit, UnitType } from "./types";

const dorm: UnitType = {
  id: "dorm",
  name: "Dorm bed",
  soldAs: "bed",
  rate: 500,
  maxGuests: 1,
  femaleOnly: false,
  gst: "auto",
  order: 1,
};
const king: UnitType = {
  id: "king",
  name: "King room",
  soldAs: "room",
  rate: 2400,
  maxGuests: 2,
  femaleOnly: false,
  gst: "auto",
  order: 2,
  plans: [
    {
      id: "bb",
      name: "With breakfast",
      meal: "breakfast",
      refundable: true,
      adjust: 400,
      active: true,
    },
    {
      id: "nr",
      name: "Non-refundable",
      meal: "room_only",
      refundable: false,
      adjustPct: -10,
      active: true,
    },
  ],
};
const types = [dorm, king];
const u = (id: string, typeId: string, room: string, hk: Unit["housekeeping"] = "clean"): Unit => ({
  id,
  typeId,
  label: id,
  room,
  housekeeping: hk,
});
const units: Unit[] = [
  u("8A", "dorm", "Room 8"),
  u("8B", "dorm", "Room 8"),
  u("11", "king", "Room 11"),
  u("12", "king", "Room 12", "dirty"),
];
let n = 0;
const stay = (p: Partial<Stay>): Stay => ({
  id: `s${++n}`,
  reference: `STY-${n}`,
  source: "walk_in",
  status: "booked",
  checkIn: "2026-12-01",
  checkOut: "2026-12-03",
  guest: { name: "Asha Rai", phone: "9876543210", idSeen: "Aadhaar" },
  lines: [{ typeId: "dorm", units: 1, guests: 1, rate: 500, unitIds: ["8A"] }],
  charges: [],
  payments: [],
  createdAt: 0,
  createdBy: "desk",
  ...p,
});

describe("rate plans and restrictions", () => {
  it("prices plans off the night's room rate", () => {
    expect(planRateOn(king, king.plans![0], "2026-12-01")).toBe(2800);
    expect(planRateOn(king, king.plans![1], "2026-12-01")).toBe(2160);
    expect(
      quotePlan(
        { ...king, calendar: { "2026-12-02": { rate: 3000 } } },
        king.plans![0],
        "2026-12-01",
        "2026-12-03",
      ),
    ).toBe(3100);
    expect(plansOf(dorm).map((p) => p.name)).toEqual(["Room only"]);
  });
  it("online sale obeys stop-sell, minimum stay, CTA and CTD", () => {
    const cal = applyRestrictions(king, "2026-12-05", "2026-12-05", { minStay: 2, cta: true })!;
    const t = {
      ...king,
      calendar: { ...cal, "2026-12-08": { ctd: true }, "2026-12-10": { closed: true } },
    };
    expect(restrictionProblems(t, "2026-12-05", "2026-12-06")).toHaveLength(2);
    expect(restrictionProblems(t, "2026-12-06", "2026-12-08")[0]).toMatch(/closed to departure/);
    expect(restrictionProblems(t, "2026-12-09", "2026-12-11")[0]).toMatch(/closed to sale/);
    expect(restrictionProblems(t, "2026-12-01", "2026-12-03")).toEqual([]);
    expect(
      applyRestrictions(t, "2026-12-05", "2026-12-05", { minStay: null, cta: false })![
        "2026-12-05"
      ],
    ).toBeUndefined();
    expect(() =>
      cleanPlans([
        { id: "a", name: "BB", meal: "breakfast", refundable: true, active: true },
        { id: "b", name: "bb", meal: "breakfast", refundable: true, active: true },
      ]),
    ).toThrow(/Two plans/);
  });
});

describe("tape chart", () => {
  it("draws bars clipped to the window and lists stays without beds", () => {
    const a = stay({ checkIn: "2026-11-29", checkOut: "2026-12-03" });
    const b = stay({ lines: [{ typeId: "dorm", units: 1, guests: 1, rate: 500, unitIds: [] }] });
    const bars = tapeBars([a, b], "2026-12-01", 7);
    expect(bars).toEqual([
      expect.objectContaining({ unitId: "8A", start: 0, span: 2, before: true, after: false }),
    ]);
    expect(unassignedIn([a, b], "2026-12-01", 7).map((s) => s.id)).toEqual([b.id]);
    expect(tapeRows(types, units).map((r) => r.unit.id)).toEqual(["8A", "8B", "11", "12"]);
  });
  it("moves a guest to another bed, shifts dates, stretches check-out, and refuses clashes", () => {
    const a = stay({});
    const b = stay({
      lines: [{ typeId: "dorm", units: 1, guests: 1, rate: 500, unitIds: ["8B"] }],
      checkIn: "2026-12-02",
      checkOut: "2026-12-04",
    });
    const all = [a, b];
    const moved = moveStay(
      a,
      { fromUnitId: "8A", toUnitId: "8B", shift: -1 },
      types,
      units,
      all,
      "2026-11-27",
      "desk",
      1,
    );
    expect(moved.lines[0]!.unitIds).toEqual(["8B"]);
    expect([moved.checkIn, moved.checkOut]).toEqual(["2026-11-30", "2026-12-02"]);
    expect(moved.history?.[0]?.what).toMatch(/8A → 8B/);
    expect(() =>
      moveStay(a, { fromUnitId: "8A", toUnitId: "8B" }, types, units, all, "2026-11-27", "desk"),
    ).toThrow(/taken|enough/);
    expect(
      moveStay(
        a,
        { fromUnitId: "8A", toUnitId: "8A", checkOut: "2026-12-05" },
        types,
        units,
        all,
        "2026-11-27",
        "desk",
      ).checkOut,
    ).toBe("2026-12-05");
  });
  it("in-house guests keep their arrival; a single-room line can change type", () => {
    const inHouse = stay({
      status: "checked_in",
      lines: [
        {
          typeId: "king",
          units: 1,
          guests: 2,
          rate: 2400,
          unitIds: ["11"],
          planId: "bb",
          planName: "With breakfast",
        },
      ],
    });
    expect(() =>
      moveStay(
        inHouse,
        { fromUnitId: "11", toUnitId: "11", shift: 1 },
        types,
        units,
        [inHouse],
        "2026-12-01",
        "desk",
      ),
    ).toThrow(/in house/);
    expect(
      moveStay(
        inHouse,
        { fromUnitId: "11", toUnitId: "12" },
        types,
        units,
        [inHouse],
        "2026-12-01",
        "desk",
      ).lines[0]!.unitIds,
    ).toEqual(["12"]);
    expect(() =>
      moveStay(
        inHouse,
        { fromUnitId: "11", toUnitId: "8B" },
        types,
        units,
        [inHouse],
        "2026-12-01",
        "desk",
      ),
    ).toThrow(/holds 1/);
    expect(() =>
      moveStay(
        stay({ status: "checked_out" }),
        { fromUnitId: "8A", toUnitId: "8B" },
        types,
        units,
        [],
        "2026-12-01",
        "desk",
      ),
    ).toThrow(/closed/);
  });
});

describe("the desk's day", () => {
  const today = "2026-12-02";
  const arriving = stay({
    checkIn: today,
    checkOut: "2026-12-04",
    lines: [{ typeId: "king", units: 1, guests: 1, rate: 2400, unitIds: ["12"] }],
  });
  const leaving = stay({
    status: "checked_in",
    checkIn: "2026-12-01",
    checkOut: today,
    lines: [{ typeId: "dorm", units: 1, guests: 1, rate: 500, unitIds: ["8A"] }],
  });
  it("cleans the room with a guest arriving first", () => {
    const board = housekeepingBoard(units, [arriving, leaving], today);
    expect(board[0]).toEqual(expect.objectContaining({ state: "arriving", guest: "Asha Rai" }));
    expect(board[0]!.unit.id).toBe("12");
    expect(board.find((r) => r.unit.id === "8A")?.state).toBe("departing");
  });
  it("the night audit finds no-shows, overstays and money owed, and sums the day", () => {
    const noShow = stay({ checkIn: today, checkOut: "2026-12-03" });
    const owing = stay({
      status: "checked_in",
      checkIn: "2026-12-01",
      checkOut: "2026-12-05",
      payments: [
        {
          id: "p",
          kind: "payment",
          amount: 300,
          mode: "upi",
          at: Date.parse(`${today}T10:00:00`),
          by: "d",
        },
      ],
    });
    const c = auditChecks([noShow, owing, leaving], types, today);
    expect(c.noShows.map((s) => s.id)).toEqual([noShow.id]);
    expect(c.overstays.map((s) => s.id)).toEqual([leaving.id]);
    expect(c.unpaid[0]?.stay.id).toBe(owing.id);
    const a = auditSummary([owing], units, today, 1, "desk", [noShow.id]);
    expect(a).toEqual(
      expect.objectContaining({
        id: today,
        inHouse: 1,
        roomRevenue: 500,
        collected: { upi: 300 },
        noShows: [noShow.id],
      }),
    );
  });
});

describe("stay invoice", () => {
  it("prints the invoice number, GST per line and what was paid", () => {
    const s = stay({
      status: "checked_out",
      invoice: { no: "STAY/0007", at: 0 },
      lines: [{ typeId: "king", units: 1, guests: 2, rate: 2400, unitIds: ["11"] }],
      charges: [{ id: "c", label: "Bike", amount: 800, gstPct: 18, at: 0, by: "d" }],
      payments: [{ id: "p", kind: "payment", amount: 5984, mode: "cash", at: 0, by: "d" }],
    });
    const html = invoiceHtml(s, types, {
      name: "Pinewood <Backpackers>",
      gstin: "17ABCDE1234F1Z5",
    });
    expect(html).toContain("Tax invoice STAY/0007");
    expect(html).toContain("&lt;Backpackers&gt;");
    expect(html).toContain("GSTIN 17ABCDE1234F1Z5");
    expect(html).toMatch(/Settled/);
    const { invoice: _i, ...open } = s;
    void _i;
    expect(invoiceHtml(open, types, { name: "P" })).toContain("not a tax invoice");
  });
});

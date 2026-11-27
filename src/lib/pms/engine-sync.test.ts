import { describe, expect, it } from "vitest";
import { freeForStay } from "./inventory";
import {
  engineFeedUrl,
  engineTypeId,
  engineUnitId,
  parseEngineFeed,
  planEngineSync,
  type EngineFeed,
} from "./engine-sync";
import type { Stay, Unit, UnitType } from "./types";

const today = "2026-11-28";
const feed = (over: Partial<EngineFeed> = {}): EngineFeed => ({
  version: 1,
  source: "xtsy.one",
  generatedAt: "2026-11-28T00:00:00Z",
  from: today,
  days: 3,
  roomTypes: [
    {
      id: "bed-in-8-bed-mixed-dormitory",
      name: "Bed in 8 Bed Mixed Dormitory",
      soldAs: "bed",
      units: 3,
      rate: 400,
      maxGuests: 1,
      femaleOnly: false,
      order: 1,
      unitsOnFloor: [
        { label: "8A", room: "Room 8" },
        { label: "8B", room: "Room 8" },
        { label: "8C", room: "Room 8" },
      ],
    },
    {
      id: "experience-by-xtsy",
      name: "Experience by XTSY",
      descriptor: "Premium Couple Ensuite",
      soldAs: "room",
      units: 1,
      rate: 4999,
      maxGuests: 2,
      femaleOnly: false,
      order: 2,
      unitsOnFloor: [{ label: "666", room: "666" }],
    },
  ],
  free: {
    "bed-in-8-bed-mixed-dormitory": { "2026-11-28": 3, "2026-11-29": 1, "2026-11-30": 0 },
    "experience-by-xtsy": { "2026-11-28": 1, "2026-11-29": 0, "2026-11-30": 1 },
  },
  ...over,
});

const apply = (types: UnitType[], units: Unit[], plan: ReturnType<typeof planEngineSync>) => ({
  types: [...types.filter((t) => !plan.types.some((p) => p.id === t.id)), ...plan.types],
  units: [...units.filter((u) => !plan.units.some((p) => p.id === u.id)), ...plan.units],
});

const stay = (over: Partial<Stay>): Stay => ({
  id: "s1",
  reference: "STY-1",
  source: "walk_in",
  status: "booked",
  checkIn: "2026-11-28",
  checkOut: "2026-11-29",
  guest: { name: "Asha", phone: "9876543210" },
  lines: [],
  charges: [],
  payments: [],
  createdAt: 0,
  createdBy: "t",
  ...over,
});

describe("booking engine sync", () => {
  it("only pulls from the XTSY booking engine over https", () => {
    expect(engineFeedUrl("xtsy.one")).toEqual({ url: "https://xtsy.one/api/public/pms-feed" });
    expect(engineFeedUrl("https://www.xtsy.one/book")).toEqual({
      url: "https://www.xtsy.one/api/public/pms-feed",
    });
    expect("error" in engineFeedUrl("http://xtsy.one")).toBe(true);
    expect("error" in engineFeedUrl("evil.example")).toBe(true);
  });

  it("refuses a malformed feed before anything is written", () => {
    expect(parseEngineFeed({ version: 2 }).ok).toBe(false);
    const bad = feed();
    bad.roomTypes[0]!.unitsOnFloor.push({ label: "8A", room: "Room 8" });
    expect(parseEngineFeed(bad).ok).toBe(false);
    expect(parseEngineFeed(feed()).ok).toBe(true);
  });

  it("brings in room types, beds and the nights already sold, with fixed ids", () => {
    const plan = planEngineSync(feed(), [], [], [], today);
    expect(plan.types.map((t) => t.id)).toEqual([
      engineTypeId("bed-in-8-bed-mixed-dormitory"),
      engineTypeId("experience-by-xtsy"),
    ]);
    expect(plan.units.map((u) => u.id)).toContain(
      engineUnitId("bed-in-8-bed-mixed-dormitory", "8A"),
    );
    const dorm = plan.types[0]!;
    expect(dorm.channelRef).toBe("bed-in-8-bed-mixed-dormitory");
    expect(dorm.calendar).toEqual({ "2026-11-29": { held: 2 }, "2026-11-30": { held: 3 } });
    const { types, units } = apply([], [], plan);
    expect(freeForStay(types[0]!, units, [], "2026-11-29", "2026-11-30")).toBe(1);
    expect(freeForStay(types[0]!, units, [], "2026-11-30", "2026-12-01")).toBe(0);
  });

  it("writes nothing when nothing changed", () => {
    const first = planEngineSync(feed(), [], [], [], today);
    const { types, units } = apply([], [], first);
    const again = planEngineSync(feed(), types, units, [], today);
    expect(again.types).toEqual([]);
    expect(again.units).toEqual([]);
  });

  it("keeps the property's own rate plans, rates and restrictions", () => {
    const first = apply([], [], planEngineSync(feed(), [], [], [], today));
    const dorm = first.types.find((t) => t.engineRef === "bed-in-8-bed-mixed-dormitory")!;
    dorm.plans = [
      {
        id: "bf",
        name: "With breakfast",
        meal: "breakfast",
        refundable: true,
        adjust: 150,
        active: true,
      },
    ];
    dorm.calendar = {
      ...dorm.calendar,
      "2026-11-29": { held: 2, rate: 450, minStay: 2 },
      "2027-01-10": { closed: true },
    };
    const plan = planEngineSync(feed(), first.types, first.units, [], today);
    const next = plan.types.find((t) => t.id === dorm.id)!;
    expect(next.plans).toEqual(dorm.plans);
    expect(next.calendar?.["2026-11-29"]).toEqual({ held: 2, rate: 450, minStay: 2 });
    expect(next.calendar?.["2027-01-10"]).toEqual({ closed: true });
  });

  it("retires beds the engine dropped unless a current stay uses them, and never touches hand-made ones", () => {
    const first = apply([], [], planEngineSync(feed(), [], [], [], today));
    const handMade: Unit = {
      id: "mine",
      typeId: engineTypeId("bed-in-8-bed-mixed-dormitory"),
      label: "8Z",
      room: "Room 8",
      housekeeping: "clean",
    };
    const smaller = feed();
    smaller.roomTypes[0] = {
      ...smaller.roomTypes[0]!,
      units: 1,
      unitsOnFloor: [{ label: "8A", room: "Room 8" }],
    };
    const using = stay({
      lines: [
        {
          typeId: engineTypeId("bed-in-8-bed-mixed-dormitory"),
          units: 1,
          guests: 1,
          rate: 400,
          unitIds: [engineUnitId("bed-in-8-bed-mixed-dormitory", "8B")],
        },
      ],
    });
    const plan = planEngineSync(smaller, first.types, [...first.units, handMade], [using], today);
    const retired = plan.units.filter((u) => u.archived).map((u) => u.label);
    expect(retired).toEqual(["8C"]);
    expect(plan.kept.join()).toContain("8B");
    expect(plan.units.some((u) => u.id === "mine")).toBe(false);
  });

  it("renames and re-rates from the engine and reports it", () => {
    const first = apply([], [], planEngineSync(feed(), [], [], [], today));
    const f = feed();
    f.roomTypes[1] = { ...f.roomTypes[1]!, name: "Experience by XTSY Suite", rate: 5499 };
    const plan = planEngineSync(f, first.types, first.units, [], today);
    expect(plan.changes.join(" | ")).toContain("base rate ₹4999 → ₹5499");
  });
});

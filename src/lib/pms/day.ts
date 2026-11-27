/**
 * The front desk's day: the housekeeping board (what to clean first and who is on it), the
 * arrivals/departures checklist, and the night audit that closes the day. Pure; tested.
 */
import { addDays, nightsOf } from "./dates";
import { folioOf } from "./folio";
import { HOLDS_NIGHTS, byLabel, occupancy } from "./inventory";
import { stayStats } from "./reports";
import type { IsoDate, NightAudit, Stay, Unit, UnitType } from "./types";

export type BoardState = "arriving" | "departing" | "occupied" | "vacant";

export interface BoardRow {
  unit: Unit;
  state: BoardState;
  /** Lower comes first: dirty beds with a guest arriving today lead. */
  priority: number;
  /** Guest arriving today, or staying, on this bed/room. */
  guest?: string;
}

/** Every bed/room with what is happening on it today, ordered for the cleaning round. */
export function housekeepingBoard(units: Unit[], stays: Stay[], today: IsoDate): BoardRow[] {
  const live = stays.filter(HOLDS_NIGHTS);
  const tonight = occupancy(live, today, addDays(today, 1));
  const lastNight = occupancy(live, addDays(today, -1), today);
  const arrivingIds = new Set(
    live.filter((s) => s.checkIn === today).flatMap((s) => s.lines.flatMap((l) => l.unitIds)),
  );
  const departingIds = new Set(
    live
      .filter((s) => s.checkOut === today && s.status === "checked_in")
      .flatMap((s) => s.lines.flatMap((l) => l.unitIds)),
  );
  const byId = new Map(stays.map((s) => [s.id, s]));
  return units
    .filter((u) => !u.archived)
    .map((unit) => {
      const sid = tonight.get(unit.id)?.get(today);
      const state: BoardState = arrivingIds.has(unit.id)
        ? "arriving"
        : departingIds.has(unit.id)
          ? "departing"
          : sid
            ? "occupied"
            : "vacant";
      const dirty = unit.housekeeping === "dirty" || unit.housekeeping === "inspect";
      const base = { arriving: 0, departing: 1, vacant: 2, occupied: 3 }[state];
      const priority = unit.housekeeping === "out_of_order" ? 9 : dirty ? base : base + 4;
      const guest = sid
        ? byId.get(sid)?.guest.name
        : lastNight.get(unit.id)?.get(addDays(today, -1))
          ? byId.get(lastNight.get(unit.id)!.get(addDays(today, -1))!)?.guest.name
          : undefined;
      return { unit, state, priority, ...(guest ? { guest } : {}) };
    })
    .sort((a, b) => a.priority - b.priority || byLabel(a.unit, b.unit));
}

export interface AuditCheck {
  /** Booked, due on or before the day, never arrived: become no-shows. */
  noShows: Stay[];
  /** In house past their check-out day: extend or check out. */
  overstays: Stay[];
  /** In house with money owing. */
  unpaid: { stay: Stay; due: number }[];
  /** Arriving tomorrow without beds yet. */
  unassignedTomorrow: Stay[];
  /** Foreign guests in house without Form-III recorded. */
  formIII: Stay[];
}

/** What the night audit finds for the day being closed. */
export function auditChecks(stays: Stay[], types: UnitType[], day: IsoDate): AuditCheck {
  const tomorrow = addDays(day, 1);
  return {
    noShows: stays.filter((s) => s.status === "booked" && s.checkIn <= day),
    overstays: stays.filter((s) => s.status === "checked_in" && s.checkOut <= day),
    unpaid: stays
      .filter((s) => s.status === "checked_in")
      .map((stay) => ({ stay, due: folioOf(stay, types).due }))
      .filter((x) => x.due > 0),
    unassignedTomorrow: stays.filter(
      (s) =>
        s.status === "booked" &&
        s.checkIn === tomorrow &&
        s.lines.some((l) => l.unitIds.length < l.units),
    ),
    formIII: stays.filter(
      (s) =>
        s.status === "checked_in" &&
        !!s.guest.nationality &&
        s.guest.nationality !== "IN" &&
        !s.formIII,
    ),
  };
}

/** The day's figures kept with the audit: occupancy, room revenue for the night, money taken by mode. */
export function auditSummary(
  stays: Stay[],
  units: Unit[],
  day: IsoDate,
  at: number,
  by: string,
  noShows: string[],
  notes?: string,
): NightAudit {
  const stats = stayStats(stays, units, day, addDays(day, 1));
  const roomRevenue = Math.round(
    stays
      .filter((s) => HOLDS_NIGHTS(s) || s.status === "checked_out")
      .filter((s) => nightsOf(s.checkIn, s.checkOut).includes(day))
      .reduce((sum, s) => sum + s.lines.reduce((n, l) => n + l.rate * l.units, 0), 0),
  );
  const start = Date.parse(`${day}T00:00:00`);
  const end = start + 86_400_000;
  const collected: Record<string, number> = {};
  for (const s of stays)
    for (const p of s.payments) {
      if (p.at < start || p.at >= end) continue;
      collected[p.mode] =
        Math.round(
          ((collected[p.mode] ?? 0) + (p.kind === "refund" ? -p.amount : p.amount)) * 100,
        ) / 100;
    }
  return {
    id: day,
    date: day,
    at,
    by,
    arrivals: stays.filter(
      (s) => s.checkIn === day && (s.status === "checked_in" || s.status === "checked_out"),
    ).length,
    departures: stays.filter((s) => s.checkOut === day && s.status === "checked_out").length,
    inHouse: stays.filter((s) => s.status === "checked_in" && s.checkIn <= day && s.checkOut > day)
      .length,
    occupancyPct: Math.round(stats.occupancyPct),
    roomRevenue,
    collected,
    noShows,
    ...(notes?.trim() ? { notes: notes.trim().slice(0, 300) } : {}),
  };
}

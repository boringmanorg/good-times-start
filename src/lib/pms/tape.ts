/**
 * The tape chart: beds and rooms down the side, nights across, each stay a bar. Bars can be
 * moved to another bed or room, shifted to other dates, or stretched to a new check-out.
 * Pure; the screen (TapeChart.tsx) draws the bars and saves through pms/actions.ts.
 */
import { addDays, daysBetween, nightsOf } from "./dates";
import { HOLDS_NIGHTS, byLabel } from "./inventory";
import { bookingProblems } from "./stay-flow";
import type { IsoDate, Stay, Unit, UnitType } from "./types";

export interface TapeBar {
  stayId: string;
  unitId: string;
  /** First and last visible night index in the window. */
  start: number;
  span: number;
  /** The stay goes on before / after the window. */
  before: boolean;
  after: boolean;
  status: Stay["status"];
  label: string;
}

export interface TapeRow {
  unit: Unit;
  type: UnitType;
}

/** Rows grouped by type in the type's order, beds/rooms by label. */
export function tapeRows(types: UnitType[], units: Unit[]): TapeRow[] {
  return types.flatMap((type) =>
    units
      .filter((u) => u.typeId === type.id && !u.archived)
      .sort(byLabel)
      .map((unit) => ({ unit, type })),
  );
}

/** Bars for the window [from, from + days). */
export function tapeBars(stays: Stay[], from: IsoDate, days: number): TapeBar[] {
  const to = addDays(from, days);
  const out: TapeBar[] = [];
  for (const s of stays) {
    if (!HOLDS_NIGHTS(s) && s.status !== "checked_out") continue;
    if (s.checkOut <= from || s.checkIn >= to) continue;
    const startDay = s.checkIn < from ? from : s.checkIn;
    const endDay = s.checkOut > to ? to : s.checkOut;
    const start = daysBetween(from, startDay);
    const span = daysBetween(startDay, endDay);
    for (const l of s.lines)
      for (const unitId of l.unitIds) {
        out.push({
          stayId: s.id,
          unitId,
          start,
          span,
          before: s.checkIn < from,
          after: s.checkOut > to,
          status: s.status,
          label: s.guest.name,
        });
      }
  }
  return out;
}

/** Booked stays in the window still waiting for beds or rooms. */
export function unassignedIn(stays: Stay[], from: IsoDate, days: number): Stay[] {
  const to = addDays(from, days);
  return stays.filter(
    (s) =>
      s.status === "booked" &&
      s.checkIn < to &&
      s.checkOut > from &&
      s.lines.some((l) => l.unitIds.length < l.units),
  );
}

export interface TapeMove {
  /** The bed/room the bar was on, and where it goes (same when only dates change). */
  fromUnitId: string;
  toUnitId: string;
  /** Whole-stay shift in nights (booked stays only). */
  shift?: number;
  /** New check-out (stretch or shorten). */
  checkOut?: IsoDate;
}

const TERMINAL: Stay["status"][] = ["checked_out", "cancelled", "no_show"];

/**
 * The stay after a move, or an error the screen shows. In-house guests can change bed/room and
 * check-out, never the arrival. A bed moves within its line; moving to another type moves a
 * single-unit line to that type at the agreed rate.
 */
export function moveStay(
  stay: Stay,
  move: TapeMove,
  types: UnitType[],
  units: Unit[],
  stays: Stay[],
  today: IsoDate,
  by: string,
  now = Date.now(),
): Stay {
  if (TERMINAL.includes(stay.status)) throw new Error("This stay is closed; it can't be moved.");
  const shift = move.shift ?? 0;
  if (shift && stay.status !== "booked")
    throw new Error("The guest is in house: only the bed or room and the check-out can change.");
  const checkIn = addDays(stay.checkIn, shift);
  let checkOut = move.checkOut ?? addDays(stay.checkOut, shift);
  if (move.checkOut && shift) checkOut = move.checkOut;
  if (stay.status === "booked" && checkIn < today)
    throw new Error("A booking can't be moved into the past.");
  if (daysBetween(checkIn, checkOut) < 1) throw new Error("A stay needs at least one night.");
  if (stay.status === "checked_in" && checkOut <= today)
    throw new Error("Check-out is today or later; check the guest out instead.");
  const lineIndex = stay.lines.findIndex((l) => l.unitIds.includes(move.fromUnitId));
  if (lineIndex < 0) throw new Error("That bed or room isn't on this stay.");
  const target = units.find((u) => u.id === move.toUnitId);
  if (!target) throw new Error("Choose a bed or room.");
  if (target.housekeeping === "out_of_order") throw new Error(`${target.label} is out of order.`);
  const line = stay.lines[lineIndex]!;
  let lines = stay.lines;
  if (move.toUnitId !== move.fromUnitId) {
    if (target.typeId === line.typeId) {
      if (line.unitIds.includes(move.toUnitId))
        throw new Error(`${target.label} is already on this stay.`);
      lines = stay.lines.map((l, i) =>
        i === lineIndex
          ? { ...l, unitIds: l.unitIds.map((id) => (id === move.fromUnitId ? move.toUnitId : id)) }
          : l,
      );
    } else {
      if (line.units !== 1)
        throw new Error(
          "Move one bed at a time within the same type, or open the stay to change the room type.",
        );
      const type = types.find((t) => t.id === target.typeId);
      if (!type) throw new Error("That room type no longer exists.");
      if (line.guests > type.maxGuests)
        throw new Error(`${type.name} holds ${type.maxGuests} guest(s).`);
      const plan = type.plans?.find((p) => p.id === line.planId);
      const { planId: _p, planName: _n, ...rest } = line;
      void _p;
      void _n;
      lines = stay.lines.map((l, i) =>
        i === lineIndex
          ? {
              ...rest,
              typeId: target.typeId,
              unitIds: [move.toUnitId],
              ...(plan ? { planId: plan.id, planName: plan.name } : {}),
            }
          : l,
      );
    }
  }
  const next: Stay = { ...stay, checkIn, checkOut, lines };
  const others = stays.map((s) => (s.id === stay.id ? next : s));
  const problems = bookingProblems(next, types, units, others).filter(
    (p) => !/name|mobile/.test(p),
  );
  if (problems.length) throw new Error(problems[0]);
  const what: string[] = [];
  if (move.toUnitId !== move.fromUnitId)
    what.push(`${units.find((u) => u.id === move.fromUnitId)?.label ?? "?"} → ${target.label}`);
  if (checkIn !== stay.checkIn || checkOut !== stay.checkOut)
    what.push(`${stay.checkIn}–${stay.checkOut} → ${checkIn}–${checkOut}`);
  if (!what.length) return stay;
  return { ...next, history: [...(stay.history ?? []), { at: now, by, what: what.join(" · ") }] };
}

/** Nights in the window, for the header. */
export const windowNights = (from: IsoDate, days: number): IsoDate[] =>
  nightsOf(from, addDays(from, days));

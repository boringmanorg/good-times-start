/**
 * The day at the desk and the numbers a hotelier reads: arrivals, departures, in-house,
 * occupancy, average rate (ADR) and revenue per available unit (RevPAR). Room revenue only,
 * before GST.
 */
import { nightsOf } from "./dates";
import { HOLDS_NIGHTS } from "./inventory";
import type { IsoDate, Stay, Unit } from "./types";

export interface DeskDay {
  arrivals: Stay[];
  departures: Stay[];
  inHouse: Stay[];
}

export function deskDay(stays: Stay[], today: IsoDate): DeskDay {
  return {
    arrivals: stays.filter((s) => s.status === "booked" && s.checkIn === today),
    departures: stays.filter((s) => s.status === "checked_in" && s.checkOut === today),
    inHouse: stays.filter((s) => s.status === "checked_in"),
  };
}

export interface StayStats { unitNights: number; soldNights: number; occupancyPct: number; roomRevenue: number; adr: number; revpar: number }

export function stayStats(stays: Stay[], units: Unit[], from: IsoDate, to: IsoDate): StayStats {
  const nights = nightsOf(from, to);
  const window = new Set(nights);
  const live = units.filter((u) => !u.archived && u.housekeeping !== "out_of_order").length;
  const unitNights = live * nights.length;
  let soldNights = 0;
  let roomRevenue = 0;
  for (const s of stays) {
    if (!HOLDS_NIGHTS(s) && s.status !== "checked_out") continue;
    for (const night of nightsOf(s.checkIn, s.checkOut)) {
      if (!window.has(night)) continue;
      for (const l of s.lines) { soldNights += l.units; roomRevenue += l.rate * l.units; }
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    unitNights, soldNights,
    occupancyPct: unitNights ? r((soldNights / unitNights) * 100) : 0,
    roomRevenue: r(roomRevenue),
    adr: soldNights ? r(roomRevenue / soldNights) : 0,
    revpar: unitNights ? r(roomRevenue / unitNights) : 0,
  };
}

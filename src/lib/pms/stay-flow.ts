/**
 * Booking → check-in → check-out, cancellation and no-show: what the desk may do now, and why not.
 * Pure: returns a reason the button shows, or null when the step is allowed.
 */
import { daysBetween, nightsOf } from "./dates";
import { folioOf } from "./folio";
import { freeForStay, unitsFreeFor } from "./inventory";
import type { IsoDate, Stay, Unit, UnitType } from "./types";

export const MAX_STAY_NIGHTS = 60;

/** Problems with a new or edited booking, in the order the desk should fix them. */
export function bookingProblems(
  stay: Stay,
  types: UnitType[],
  units: Unit[],
  stays: Stay[],
): string[] {
  const out: string[] = [];
  const nights = nightsOf(stay.checkIn, stay.checkOut).length;
  if (stay.guest.name.trim().length < 2) out.push("Enter the guest's name.");
  if (!/^\+?[0-9 ]{8,16}$/.test(stay.guest.phone.trim()))
    out.push("Enter the guest's mobile number.");
  if (nights < 1) out.push("Check-out must be after check-in.");
  if (nights > MAX_STAY_NIGHTS)
    out.push(`Stays longer than ${MAX_STAY_NIGHTS} nights are split into two bookings.`);
  if (stay.lines.length === 0) out.push("Choose at least one bed or room.");
  let guests = 0;
  for (const l of stay.lines) {
    const type = types.find((t) => t.id === l.typeId);
    if (!type) {
      out.push("That room type no longer exists.");
      continue;
    }
    if (l.units < 1) out.push(`${type.name}: choose at least one.`);
    if (l.guests < 1 || l.guests > l.units * type.maxGuests)
      out.push(`${type.name}: ${l.units} hold up to ${l.units * type.maxGuests} guest(s).`);
    if (!(l.rate >= 0)) out.push(`${type.name}: enter a rate.`);
    if (type.femaleOnly && (stay.femaleGuests ?? 0) < l.guests)
      out.push(`${type.name} is for women only.`);
    if (l.unitIds.length > l.units) out.push(`${type.name}: more beds/rooms given than booked.`);
    if (
      nights >= 1 &&
      freeForStay(type, units, stays, stay.checkIn, stay.checkOut, stay.id) < l.units
    )
      out.push(`${type.name}: not enough free for these dates.`);
    if (l.unitIds.length) {
      const free = new Set(
        unitsFreeFor(type.id, units, stays, stay.checkIn, stay.checkOut, stay.id).map((u) => u.id),
      );
      const taken = l.unitIds.filter((id) => !free.has(id));
      if (taken.length)
        out.push(
          `${type.name}: ${taken.map((id) => units.find((u) => u.id === id)?.label ?? id).join(", ")} already taken on these dates.`,
        );
    }
    guests += l.guests;
  }
  if ((stay.femaleGuests ?? 0) > guests) out.push("More women than guests in the group.");
  return out;
}

export function canCheckIn(stay: Stay, units: Unit[], today: IsoDate): string | null {
  if (stay.status !== "booked") return "Only a booked stay can be checked in.";
  if (daysBetween(stay.checkIn, today) < 0) return `Arrives on ${stay.checkIn}.`;
  if (daysBetween(stay.checkOut, today) >= 0) return "The stay's dates are over.";
  for (const l of stay.lines)
    if (l.unitIds.length < l.units) return "Give every guest a bed or room first.";
  const notReady = stay.lines
    .flatMap((l) => l.unitIds)
    .map((id) => units.find((u) => u.id === id))
    .find((u) => u && u.housekeeping !== "clean");
  if (notReady) return `${notReady.label} isn't clean yet.`;
  if (stay.guest.nationality && stay.guest.nationality !== "IN" && !stay.guest.idSeen)
    return "Check the guest's passport and visa first.";
  if (!stay.guest.idSeen) return "Note which ID the guest showed.";
  return null;
}

/** Check-out needs the folio settled; open restaurant room bills are settled at the counter first. */
export function canCheckOut(stay: Stay, types: UnitType[], openRoomBills: number): string | null {
  if (stay.status !== "checked_in") return "Only a checked-in guest can check out.";
  if (openRoomBills > 0)
    return `${openRoomBills} restaurant bill${openRoomBills === 1 ? " is" : "s are"} still open on the room. Settle them on Restaurant POS first.`;
  const due = folioOf(stay, types).due;
  if (due > 0) return `₹${due.toLocaleString("en-IN")} is still due.`;
  if (due < 0) return `Refund ₹${(-due).toLocaleString("en-IN")} before check-out.`;
  return null;
}

export function canCancel(stay: Stay, reason: string): string | null {
  if (stay.status !== "booked") return "Only a stay that hasn't checked in can be cancelled.";
  if (reason.trim().length < 4) return "Say why the booking is cancelled.";
  return null;
}

export function canMarkNoShow(stay: Stay, today: IsoDate): string | null {
  if (stay.status !== "booked") return "Only a booked stay can be a no-show.";
  if (daysBetween(stay.checkIn, today) < 1)
    return "A no-show is marked from the day after arrival.";
  return null;
}

/** Foreign guest checked in with no Form-III recorded: due within 24 hours of arrival. */
export function formIIIDue(stay: Stay, now: number): { overdue: boolean; dueAt: number } | null {
  if (
    !stay.guest.nationality ||
    stay.guest.nationality === "IN" ||
    stay.formIII ||
    stay.checkedInAt === undefined
  )
    return null;
  if (stay.status !== "checked_in" && stay.status !== "checked_out") return null;
  const dueAt = stay.checkedInAt + 24 * 3_600_000;
  return { overdue: now > dueAt, dueAt };
}

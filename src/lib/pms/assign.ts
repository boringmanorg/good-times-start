/** Bed/room assignment shared by the desk and the server (sandbox, website). Pure. */
import { pickUnits, unitsFreeFor } from "./inventory";
import type { Stay, Unit } from "./types";

/** Fill each line's missing beds/rooms by the hostel rule (whole group in one room when it fits). */
export function autoAssign(stay: Stay, units: Unit[], stays: Stay[]): Stay {
  const others = stays.filter((s) => s.id !== stay.id);
  const taken = new Set<string>();
  const lines = stay.lines.map((l) => {
    if (l.unitIds.length >= l.units) {
      l.unitIds.forEach((id) => taken.add(id));
      return l;
    }
    const free = unitsFreeFor(l.typeId, units, others, stay.checkIn, stay.checkOut).filter(
      (u) => !taken.has(u.id) && !l.unitIds.includes(u.id),
    );
    const picked = pickUnits(free, l.units - l.unitIds.length) ?? [];
    const unitIds = [...l.unitIds, ...picked.map((u) => u.id)];
    unitIds.forEach((id) => taken.add(id));
    return { ...l, unitIds };
  });
  return { ...stay, lines };
}

/** STY-261201-4F7K: date of arrival plus four letters, unique without a cloud call. */
export function stayReference(checkIn: string, random: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from({ length: 4 }, () => abc[Math.floor(random() * abc.length)]).join("");
  return `STY-${checkIn.slice(2).replace(/-/g, "")}-${tail}`;
}

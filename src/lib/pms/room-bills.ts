/**
 * Restaurant bills on a guest's room: POS room bills (QR room service or the counter) whose
 * table is one of the stay's beds/rooms. They are settled at POS Billdesk, never by the desk
 * on its own (room bills are never settled implicitly), and check-out waits for them.
 */
import type { Order } from "../types";
import type { Stay, Unit } from "./types";

/** "Room 2A", "room-2a", "2A" → "2a". */
export const placeKey = (label: string | undefined) => (label ?? "").toLowerCase().replace(/^room\s*/, "").replace(/[\s-]+/g, "");

export function openRoomBills(stay: Stay, units: Unit[], orders: Order[]): Order[] {
  const keys = new Set(stay.lines.flatMap((l) => l.unitIds).map((id) => placeKey(units.find((u) => u.id === id)?.label)).filter(Boolean));
  if (!keys.size) return [];
  const from = stay.checkedInAt ?? Number.POSITIVE_INFINITY;
  return orders.filter((o) => o.status === "held" && keys.has(placeKey(o.tableLabel)) && (o.createdAt ?? 0) >= from - 3_600_000);
}

import { placeName } from "@/lib/table-logic";
import type { Storefront } from "@/lib/guest-order-logic";
import { isRoomSection, roomGroups, roomLabel, roomOpen } from "@/lib/room-logic";

type Place = Storefront["tables"][number];

/** What a guest calls the place they order to: "D1", "Room 2 · Bed A", "Experience by XTSY". */
export function guestPlaceName(store: Pick<Storefront, "rooms">, place: Place | undefined, fallback = ""): string {
  if (!place) return placeName(fallback);
  return isRoomSection(place.section) ? roomLabel(place, store.rooms) : placeName(place.label);
}

/** True when at least one room takes room-service orders. */
export function hasOpenRooms(store: Storefront): boolean {
  if (!store.rooms) return false;
  const { privateRooms, dorms } = roomGroups(store.tables, store.rooms);
  return [...privateRooms, ...dorms.flatMap((d) => d.beds)].some((p) => roomOpen(p.id, store.rooms));
}

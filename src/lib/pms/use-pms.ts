import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../db";
import type { Order } from "../types";
import type { Stay, Unit, UnitType } from "./types";

/** The front desk's live data from this device's IndexedDB (synced like every POS record). */
export function usePms(): { types: UnitType[]; units: Unit[]; stays: Stay[]; heldOrders: Order[] } {
  const types = useLiveQuery(async () => (await getDb().unitTypes.toArray()).filter((t) => !t.archived).sort((a, b) => a.order - b.order), [], [] as UnitType[]);
  const units = useLiveQuery(async () => (await getDb().units.toArray()).filter((u) => !u.archived), [], [] as Unit[]);
  const stays = useLiveQuery(() => getDb().stays.toArray(), [], [] as Stay[]);
  const heldOrders = useLiveQuery(() => getDb().orders.where("status").equals("held").toArray(), [], [] as Order[]);
  return { types, units, stays, heldOrders };
}

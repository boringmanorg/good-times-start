/** Saves an admin correction to a settled bill (rules in bill-amend-logic.ts). */
import { getDb, markDirty } from "./db";
import type { Order } from "./types";

/**
 * Needs the internet: the cloud checks the 48-hour window against its own clock,
 * and a correction refused later would sit on this device as a sync error.
 */
export async function saveAmendment(amended: Order): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Connect to the internet to correct a settled bill");
  if (!amended.uid) throw new Error("This bill has no id yet; sync first");
  const db = getDb();
  await db.transaction("rw", [db.orders], async () => {
    const current = await db.orders.where("uid").equals(amended.uid!).first();
    if (!current || current.status !== "settled") throw new Error("This bill is no longer settled on this device");
    if ((current.amendments?.length ?? 0) !== (amended.amendments?.length ?? 1) - 1) throw new Error("This bill was corrected on another device. Close and open it again.");
    await db.orders.put(current.id === undefined ? amended : { ...amended, id: current.id });
  });
  // Queued after the write commits, so the push always carries the corrected bill.
  await markDirty(["order", amended.uid]);
}

/** The day this bill was settled, as YYYY-MM-DD in local time. */
function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** True when cash for the bill's settlement day has already been closed and counted. */
export async function cashDayClosed(order: Pick<Order, "settledAt">): Promise<boolean> {
  if (!order.settledAt) return false;
  return (await getDb().dayCloses.where("day").equals(dayOf(order.settledAt)).count()) > 0;
}

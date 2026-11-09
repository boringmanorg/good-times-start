import { getDb } from "./db";
import { reservationDraft, type Reservation } from "./reservations";

/** Explicit staff command only: prepare a local draft, without allocating numbers, submitting KOTs or settling anything. */
export async function startReservationOrder(r: Reservation): Promise<void> {
  const db = getDb();
  const tableId = r.table_id;
  if (!tableId) throw new Error("Allot a table to this booking first.");
  await db.transaction("rw", db.orders, db.drafts, db.restTables, async () => {
    const table = await db.restTables.get(tableId);
    if (!table) throw new Error("This table hasn't synced yet. Wait for the floor to load and retry.");
    const running = await db.orders.where("tableId").equals(tableId).filter((o) => o.status === "held").first();
    const draft = await db.drafts.get(tableId);
    await db.drafts.put(reservationDraft(r, draft, running, Date.now()));
  });
}
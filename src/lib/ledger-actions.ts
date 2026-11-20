import { getDb, markDirty } from "./db";
import { ledgerProblem } from "./ledger-logic";
import { newUid } from "./sync-core";
import type { LedgerEntry } from "./types";

/** Save a vendor payment, expense or income. Works offline; syncs like any record. Owner/manager only (the cloud checks too). */
export async function recordLedgerEntry(entry: Omit<LedgerEntry, "id" | "recordedAt">): Promise<LedgerEntry> {
  const problem = ledgerProblem(entry);
  if (problem) throw new Error(problem);
  const saved: LedgerEntry = { ...entry, id: newUid(), recordedAt: Date.now(), amount: Math.round(entry.amount * 100) / 100,
    ...(entry.note ? { note: entry.note.trim().slice(0, 200) } : {}), ...(entry.reference ? { reference: entry.reference.trim().slice(0, 60) } : {}) };
  await getDb().ledger.add(saved);
  await markDirty(["ledger", saved.id]);
  return saved;
}

/** Cross out an entry with a reason. It stays in the books, voided; nothing is deleted. */
export async function voidLedgerEntry(id: string, by: string, reason: string): Promise<void> {
  const why = reason.trim();
  if (why.length < 4) throw new Error("Say why this entry is wrong");
  const db = getDb();
  const entry = await db.ledger.get(id);
  if (!entry) throw new Error("Entry not found");
  if (entry.void) throw new Error("This entry is already voided");
  await db.ledger.put({ ...entry, void: { at: Date.now(), by, reason: why.slice(0, 200) } });
  await markDirty(["ledger", id]);
}

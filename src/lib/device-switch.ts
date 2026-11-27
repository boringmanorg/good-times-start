/**
 * A device holds one outlet's data. When a login for a different outlet signs in (another product's
 * door, or the Lovable preview moving from TAB Bistro to the hostel), the old outlet's local copy is
 * cleared first — but only when nothing on this device is still waiting for the cloud.
 */
import { getDb, resetDevice } from "@/lib/db";

export type SwitchDecision = { action: "keep" } | { action: "clear" } | { action: "refuse"; reason: string };

/** Pure rule (tested): what to do with the device's copy before a login for `outletIds` uses it. */
export function deviceSwitchDecision(bound: unknown, outletIds: string[], pending: number, drafts: number): SwitchDecision {
  if (typeof bound !== "string" || !bound || outletIds.includes(bound)) return { action: "keep" };
  if (pending > 0) return { action: "refuse", reason: `This device has ${pending} change${pending === 1 ? "" : "s"} from another outlet that haven't reached the cloud. Open that outlet and sync first.` };
  if (drafts > 0) return { action: "refuse", reason: "This device has unsent items on a bill from another outlet. Send or clear them there first." };
  return { action: "clear" };
}

/** Null when the device is free for one of `outletIds` (clearing it if needed); else what to do first. */
export async function freeDeviceFor(outletIds: string[]): Promise<string | null> {
  const db = getDb();
  const bound = (await db.meta.get("restaurantId"))?.value;
  const [pending, drafts] = await Promise.all([db.outbox.count(), db.drafts.count()]);
  const d = deviceSwitchDecision(bound, outletIds, pending, drafts);
  if (d.action === "refuse") return d.reason;
  if (d.action === "clear") await resetDevice();
  return null;
}

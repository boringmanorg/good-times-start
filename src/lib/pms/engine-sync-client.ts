/**
 * Runs the booking engine sync on this device (owner/manager only: the cloud lets only them
 * change room types). Pulls the feed straight from the engine (public, read-only, CORS open),
 * plans it with the pure planEngineSync and saves only what changed, through the normal sync.
 */
import { getDb, getSettings, markDirty, saveSettings } from "../db";
import { localDate } from "./dates";
import { engineFeedUrl, parseEngineFeed, planEngineSync } from "./engine-sync";

export interface EngineSyncResult {
  ok: boolean;
  message: string;
  changes: string[];
  kept: string[];
}

let running: Promise<EngineSyncResult> | null = null;

/** One sync at a time per device; a second call while one runs gets the same result. */
export function syncFromEngine(site?: string): Promise<EngineSyncResult> {
  running ??= run(site).finally(() => {
    running = null;
  });
  return running;
}

async function run(site?: string): Promise<EngineSyncResult> {
  const settings = await getSettings();
  const target = site ?? settings.pmsEngine?.url;
  if (!target) return { ok: false, message: "No booking engine connected.", changes: [], kept: [] };
  const where = engineFeedUrl(target);
  if ("error" in where) return { ok: false, message: where.error, changes: [], kept: [] };
  const finish = async (r: EngineSyncResult): Promise<EngineSyncResult> => {
    const fresh = await getSettings();
    await saveSettings({
      ...fresh,
      pmsEngine: { url: target, lastSyncAt: Date.now(), lastResult: r.message },
    });
    return r;
  };
  let body: unknown;
  try {
    const res = await fetch(where.url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok)
      return finish({
        ok: false,
        message: `The booking engine answered ${res.status}. Nothing was changed.`,
        changes: [],
        kept: [],
      });
    body = await res.json();
  } catch {
    return finish({
      ok: false,
      message:
        "Couldn't reach the booking engine. Nothing was changed; it tries again on the next sync.",
      changes: [],
      kept: [],
    });
  }
  const parsed = parseEngineFeed(body);
  if (!parsed.ok)
    return finish({
      ok: false,
      message: `${parsed.error} Nothing was changed.`,
      changes: [],
      kept: [],
    });
  const db = getDb();
  const [types, units, stays] = await Promise.all([
    db.unitTypes.toArray(),
    db.units.toArray(),
    db.stays.toArray(),
  ]);
  const plan = planEngineSync(parsed.feed, types, units, stays, localDate());
  if (plan.types.length || plan.units.length) {
    await db.transaction("rw", db.unitTypes, db.units, async () => {
      if (plan.types.length) await db.unitTypes.bulkPut(plan.types);
      if (plan.units.length) await db.units.bulkPut(plan.units);
    });
    await markDirty(
      ...plan.types.map((t) => ["unit_type", t.id] as ["unit_type", string]),
      ...plan.units.map((u) => ["unit", u.id] as ["unit", string]),
    );
  }
  const n = plan.changes.length;
  return finish({
    ok: true,
    message: n
      ? `Synced with ${new URL(where.url).hostname}: ${n} change${n === 1 ? "" : "s"}.`
      : `In step with ${new URL(where.url).hostname}.`,
    changes: plan.changes,
    kept: plan.kept,
  });
}

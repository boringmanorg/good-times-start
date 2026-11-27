import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ENGINE_SYNC_EVERY_MS } from "@/lib/pms/engine-sync";
import { syncFromEngine, type EngineSyncResult } from "@/lib/pms/engine-sync-client";
import { isAdmin, useStaff } from "@/lib/staff";
import { useRestaurantSettings } from "@/lib/use-settings";

const field = "mt-1 h-11 w-full rounded-full border border-input bg-background px-4 text-sm";

/**
 * Property → Booking engine. Connect xtsy.one once; from then on room types, beds and nights
 * already sold come in on every sync (EngineAutoSync), and "Sync now" pulls straight away.
 */
export function EngineSyncCard() {
  const settings = useRestaurantSettings();
  const engine = settings.pmsEngine;
  const [site, setSite] = useState(engine?.url ?? "xtsy.one");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<EngineSyncResult | null>(null);
  const go = async (url?: string) => {
    setBusy(true);
    try {
      const r = await syncFromEngine(url);
      setLast(r);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Booking engine</p>
          <p className="text-sm text-muted-foreground">
            {engine ? (
              <>
                Room types, beds and nights already sold come in from <b>{engine.url}</b> on every
                sync, so the desk never sells a bed that&apos;s gone. Each room type keeps the
                engine&apos;s id, which is also its id on the channel manager.
              </>
            ) : (
              "Connect your booking engine and its room types, beds and nights already sold (website, booking sites, your sheet) come in by themselves."
            )}
          </p>
          {engine?.lastSyncAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last sync{" "}
              {new Date(engine.lastSyncAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {engine.lastResult}
            </p>
          ) : null}
        </div>
        {engine ? (
          <Button variant="outline" disabled={busy} onClick={() => void go()}>
            <RefreshCw className={busy ? "animate-spin" : undefined} />
            Sync now
          </Button>
        ) : null}
      </div>
      {!engine ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void go(site);
          }}
        >
          <label className="min-w-60 flex-1 text-xs font-semibold text-muted-foreground">
            Booking engine address
            <input
              className={field}
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="xtsy.one"
            />
          </label>
          <Button type="submit" disabled={busy || !site.trim()}>
            {busy ? "Connecting…" : "Connect and sync"}
          </Button>
        </form>
      ) : null}
      {last && (last.changes.length || last.kept.length) ? (
        <ul className="mt-3 max-h-56 space-y-1 overflow-auto rounded-lg bg-secondary/60 p-3 text-xs">
          {last.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {last.kept.map((c) => (
            <li key={c} className="text-warning">
              Kept: {c}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Pulls from the booking engine when Hostel POS opens, every 10 minutes while it is open, and when
 * the window comes back into view. Owner/manager devices only (the cloud lets only them change room
 * types). Renders nothing.
 */
export function EngineAutoSync() {
  const { user } = useStaff();
  const settings = useRestaurantSettings();
  const url = settings.pmsEngine?.url;
  const admin = isAdmin(user);
  useEffect(() => {
    if (!url || !admin) return;
    let last = 0;
    const tick = () => {
      if (!navigator.onLine || Date.now() - last < 60_000) return;
      last = Date.now();
      void syncFromEngine();
    };
    tick();
    const t = window.setInterval(tick, ENGINE_SYNC_EVERY_MS);
    const seen = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", seen);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [url, admin]);
  return null;
}

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ago, bytes, loadOverview, loadRestaurants } from "@/lib/console-api";
import { currentBuildId } from "@/lib/app-update";
import { SEAT_APPS, type SeatApp } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Failed, Loading, Panel, Stat } from "./ConsoleBits";

/** Backend health: database, connections, sync load and every device's heartbeat. Refreshes every 30 s. */
export function ConsoleInfra() {
  const o = useQuery({ queryKey: ["console", "overview"], queryFn: loadOverview, refetchInterval: 30_000 });
  const r = useQuery({ queryKey: ["console", "restaurants"], queryFn: loadRestaurants, refetchInterval: 30_000 });
  const [build, setBuild] = useState("");
  useEffect(() => { setBuild(currentBuildId()); }, []);
  if (o.isLoading) return <Loading what="backend health" />;
  if (o.error || !o.data) return <Failed error={o.error} />;
  const db = o.data.database;
  const rollbackShare = db.commits + db.rollbacks ? (100 * db.rollbacks) / (db.commits + db.rollbacks) : 0;
  const devices = (r.data ?? []).flatMap((x) => x.devices.map((d) => ({ ...d, restaurant: x.name })));
  const now = Date.now();
  const health = (iso: string | null) => (!iso ? "bad" : now - Date.parse(iso) < 6 * 60_000 ? "good" : now - Date.parse(iso) < 24 * 3_600_000 ? "warn" : "bad");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Infra & backend</h1>
        <p className="text-sm text-muted-foreground">Lovable Cloud database and sync health · checked {ago(o.data.at)}{build ? ` · this console runs build ${build.slice(0, 12)}` : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Database size" value={bytes(db.sizeBytes)} note={`${o.data.records.toLocaleString("en-IN")} synced records`} />
        <Stat label="Connections" value={db.connections} note={`${db.activeQueries} running now`} tone={db.connections > 50 ? "warn" : undefined} />
        <Stat label="Longest running query" value={`${Math.round(db.longestQuerySeconds)} s`} tone={db.longestQuerySeconds > 30 ? "bad" : db.longestQuerySeconds > 5 ? "warn" : "good"} />
        <Stat label="Cache hit ratio" value={db.cacheHitRatio === null ? "–" : `${db.cacheHitRatio}%`} tone={db.cacheHitRatio !== null && db.cacheHitRatio < 95 ? "warn" : "good"} note="Above 99% is healthy" />
        <Stat label="Transactions" value={db.commits.toLocaleString("en-IN")} note={`${rollbackShare.toFixed(2)}% rolled back${db.statsSince ? ` · since ${new Date(db.statsSince).toLocaleDateString("en-IN")}` : ""}`} tone={rollbackShare > 5 ? "warn" : undefined} />
        <Stat label="Deadlocks" value={db.deadlocks} tone={db.deadlocks ? "warn" : "good"} />
        <Stat label="Sync load (1 h)" value={o.data.changes1h} note={`${o.data.changes24h.toLocaleString("en-IN")} changes in 24 h`} />
        <Stat label="Devices online" value={`${o.data.devicesOnline} / ${o.data.devices}`} tone={o.data.devicesOnline ? "good" : "warn"} note="Checked in within 5 min" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Largest tables">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Table</th><th className="text-right">Size</th><th className="text-right">Rows</th><th className="text-right">Dead rows</th></tr></thead>
            <tbody className="divide-y divide-border">
              {db.tables.map((t) => (
                <tr key={t.name}><td className="py-1.5 font-mono text-xs">{t.name}</td><td className="text-right tabular-nums">{bytes(t.bytes)}</td><td className="text-right tabular-nums">{t.rows.toLocaleString("en-IN")}</td>
                  <td className={cn("text-right tabular-nums", t.dead > Math.max(1000, t.rows * 0.2) && "text-warning")}>{t.dead.toLocaleString("en-IN")}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Device heartbeats">
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {devices.map((d) => {
              const h = health(d.lastSeen);
              return (
                <li key={`${d.restaurant}-${d.deviceId}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className={cn("mr-2 inline-block size-2 rounded-full", h === "good" ? "bg-success" : h === "warn" ? "bg-gold" : "bg-destructive")} aria-hidden="true" />
                    <span className="font-medium">{d.description || d.series || d.deviceId.slice(0, 8)}</span>
                    <span className="text-muted-foreground"> · {SEAT_APPS[d.app as SeatApp] ?? "—"} · {d.restaurant}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(d.lastSeen)}</span>
                </li>
              );
            })}
            {!devices.length ? <li className="py-2 text-muted-foreground">No devices.</li> : null}
          </ul>
        </Panel>
      </div>
      <Panel title="Activity that loads the backend (24 h)">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <p>Bill changes <span className="block text-xl font-bold">{o.data.bills24h}</span></p>
          <p>KOTs <span className="block text-xl font-bold">{o.data.kots24h}</span></p>
          <p>Guest QR orders <span className="block text-xl font-bold">{o.data.guestOrders24h}</span></p>
          <p>Audit events <span className="block text-xl font-bold">{o.data.auditEvents24h}</span></p>
        </div>
      </Panel>
    </div>
  );
}

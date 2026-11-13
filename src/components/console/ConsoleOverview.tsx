import { useQuery } from "@tanstack/react-query";
import { ago, loadOverview } from "@/lib/console-api";
import { Bars, Failed, Loading, Panel, Stat } from "./ConsoleBits";

export function ConsoleOverview() {
  const q = useQuery({ queryKey: ["console", "overview"], queryFn: loadOverview, refetchInterval: 60_000 });
  if (q.isLoading) return <Loading what="the overview" />;
  if (q.error || !q.data) return <Failed error={q.error} />;
  const o = q.data;
  const now = Date.now();
  const hours = Array.from({ length: 24 }, (_, i) => {
    const at = new Date(now - (23 - i) * 3_600_000); at.setMinutes(0, 0, 0);
    const n = o.changesByHour.find((h) => Math.abs(Date.parse(h.hour) - at.getTime()) < 60_000)?.n ?? 0;
    return { key: String(i), n, tip: `${at.toLocaleTimeString("en-IN", { hour: "numeric" })}: ${n} changes` };
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Overview</h1>
        <p className="text-sm text-muted-foreground">All restaurants on XTSY POS · updated {ago(o.at)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Restaurants" value={o.restaurants} note={`${o.liveAccounts} of ${o.accounts} subscriptions live`} />
        <Stat label="Monthly recurring" value={`₹${o.mrr.toLocaleString("en-IN")}`} note={`${o.complimentary} complimentary · no online payments`} />
        <Stat label="Devices online now" value={`${o.devicesOnline} / ${o.devices}`} note={`${o.devicesToday} seen today`} tone={o.devicesOnline ? "good" : undefined} />
        <Stat label="Waiting for a seat" value={o.devicesOverPlan} note={`${o.devicesBlocked} blocked by admins`} tone={o.devicesOverPlan ? "warn" : undefined} />
        <Stat label="Bills changed (24 h)" value={o.bills24h} note={`${o.kots24h} KOTs`} />
        <Stat label="Guest QR orders (24 h)" value={o.guestOrders24h} note={`${o.bookings7d} bookings in 7 days`} />
        <Stat label="Synced changes (1 h)" value={o.changes1h} note={`${o.changes24h.toLocaleString("en-IN")} in 24 h`} />
        <Stat label="Staff logins" value={o.staffUsers} note={`${o.auditEvents24h} audit events (24 h)`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Sync activity, last 24 hours" className="lg:col-span-2">
          <Bars data={hours} label="Changes synced per hour, last 24 hours" />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>24 h ago</span><span>now</span></div>
        </Panel>
        <Panel title="Plan mix">
          <ul className="space-y-2 text-sm">
            {Object.entries(o.byPlan).map(([plan, n]) => <li key={plan} className="flex justify-between"><span className="capitalize">{plan.replace("_", " ")}</span><span className="font-semibold tabular-nums">{n}</span></li>)}
          </ul>
        </Panel>
      </div>
      <Panel title="Recent subscription changes">
        {o.events.length ? (
          <ul className="divide-y divide-border text-sm">
            {o.events.map((e, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span><span className="font-medium">{e.account ?? "Account"}</span> · {e.kind.replace(/_/g, " ")}{describe(e.detail)}</span>
                <span className="text-muted-foreground">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No changes yet.</p>}
      </Panel>
    </div>
  );
}

function describe(detail: unknown): string {
  const d = detail as { from?: { plan?: string }; to?: { plan?: string; status?: string } } | null;
  if (d?.to?.plan && d.from?.plan && d.to.plan !== d.from.plan) return `: ${d.from.plan} → ${d.to.plan}`;
  if (d?.to?.status) return `: ${d.to.status}`;
  return "";
}

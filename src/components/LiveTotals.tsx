import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { getSyncSnapshot } from "@/lib/cloud-sync";
import { formatINR } from "@/lib/billing";
import { reportOrders } from "@/lib/report-orders";
import { dateLabel, dayBounds } from "@/lib/orders-history";
import { liveTotals } from "@/lib/live-totals";

/** Today's totals straight from this device's records; re-render whenever any terminal's sync lands. */
export function LiveTotals() {
  const [from, to] = dayBounds(dateLabel());
  const data = useLiveQuery(async () => {
    const [today, running, sync] = await Promise.all([
      reportOrders({ from, to: to - 1 }),
      getDb().orders.where("status").equals("held").toArray(),
      getSyncSnapshot(),
    ]);
    return { totals: liveTotals(today, running, from, to), sync };
  }, [from, to]);
  if (!data) return null;
  const { totals: t, sync } = data;
  const split = [
    { l: "Cash", v: t.cash, c: "var(--color-success)" },
    { l: "UPI", v: t.upi, c: "var(--color-primary)" },
    { l: "Card & other", v: t.other, c: "var(--color-gold)" },
  ];
  const paid = split.reduce((n, x) => n + x.v, 0);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section aria-label="Live totals for today" className="card-elevated overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3 text-xs">
        <span className="flex items-center gap-2 font-semibold uppercase tracking-wider"><span className="size-2 animate-pulse rounded-full bg-success" />Today · live<span className="font-normal normal-case tracking-normal text-muted-foreground">{today}</span></span>
        <span className="text-muted-foreground">
          {sync.lastSyncAt ? `Updated ${new Date(sync.lastSyncAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Not synced yet"}
          {sync.pendingOrders ? <span className="ml-2 font-semibold text-warning">{sync.pendingOrders} change{sync.pendingOrders === 1 ? "" : "s"} from this device still sending</span> : null}
        </span>
      </div>
      <div className="grid gap-px bg-border lg:grid-cols-[1.3fr_2fr_1fr]">
        <div className="bg-card px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Settled today</div>
          <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{formatINR(t.settled, 0)}</div>
          <div className="text-xs text-muted-foreground">{t.bills} bill{t.bills === 1 ? "" : "s"}</div>
        </div>
        <div className="bg-card px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Received by</div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            {paid > 0 ? split.map((x) => <span key={x.l} style={{ width: `${(x.v / paid) * 100}%`, background: x.c }} />) : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {split.map((x) => (
              <div key={x.l}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full" style={{ background: x.c }} />{x.l}</div>
                <div className="text-lg font-bold tabular-nums">{formatINR(x.v, 0)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gold/10 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-warning">Running bills</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatINR(t.running, 0)}</div>
          <div className="text-xs text-muted-foreground">{t.runningCount} open · not paid yet</div>
        </div>
      </div>
    </section>
  );
}

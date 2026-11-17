import { useLiveQuery } from "dexie-react-hooks";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/billing";
import { inRange, type Range } from "@/lib/report-logic";
import { reportOrders } from "@/lib/report-orders";
import { previousRange, summaryInsights } from "@/lib/summary-insights";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const pct = (n: number) => `${Math.abs(Math.round(n * 100))}%`;
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">no earlier sales to compare</span>;
  const up = value >= 0;
  return <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", up ? "text-success" : "text-destructive")}>{up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{pct(value)} {up ? "up" : "down"}</span>;
}

/** Pro Lite and above: the period against the one before, busiest times, dish movers, returning guests, purchases vs sales. */
export function SummaryInsights({ orders, range }: { orders: Order[]; range: Range }) {
  const prev = previousRange(range);
  const before = useLiveQuery(() => reportOrders(prev), [prev.from, prev.to]);
  const history = useLiveQuery(() => getDb().orders.where("createdAt").below(range.from).toArray(), [range.from]);
  const menu = useLiveQuery(() => getDb().menu.toArray(), [], []);
  const entries = useLiveQuery(() => getDb().stockEntries.toArray(), [], []);
  if (!before || !history) return <p className="py-10 text-center text-sm text-muted-foreground">Working it out…</p>;
  const i = summaryInsights(orders, inRange(before, prev), menu, range, { entries, history });
  const card = "card-elevated p-4";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([["Net sales", formatINR(i.net, 0), i.netChange, formatINR(i.netBefore, 0)], ["Bills", String(i.bills), i.billsChange, String(i.billsBefore)], ["Average bill", formatINR(i.average, 0), i.averageChange, formatINR(i.averageBefore, 0)]] as const).map(([label, value, c, was]) => (
          <div key={label} className={card}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2"><Change value={c} /><span className="text-xs text-muted-foreground">vs {was} the period before</span></div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold">When you sell most</h2>
          <dl className="divide-y divide-border text-sm">
            <div className="flex justify-between py-2"><dt>Busiest hour</dt><dd className="font-semibold">{i.peakHour ? `${hourLabel(i.peakHour.hour)} · ${formatINR(i.peakHour.net, 0)}` : "—"}</dd></div>
            <div className="flex justify-between py-2"><dt>Best day of the week</dt><dd className="font-semibold">{i.bestWeekday ? `${i.bestWeekday.name} · ${formatINR(i.bestWeekday.net, 0)}` : "Pick 7 days or more"}</dd></div>
            <div className="flex justify-between py-2"><dt>Guests with a mobile number</dt><dd className="font-semibold">{i.guests.identified}</dd></div>
            <div className="flex justify-between py-2"><dt>Returning guests</dt><dd className="font-semibold">{i.guests.returningShare === null ? "—" : `${i.guests.returning} · ${pct(i.guests.returningShare)}`}</dd></div>
            {i.purchases ? <div className="flex justify-between py-2"><dt>Purchases (approved, less returns)</dt><dd className="font-semibold">{formatINR(i.purchases.spend, 0)}{i.purchases.shareOfSales !== null ? ` · ${pct(i.purchases.shareOfSales)} of sales` : ""}</dd></div> : null}
          </dl>
        </div>
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold">Top dishes</h2>
          {i.topItems.length ? <ul className="space-y-2 text-sm">{i.topItems.map((t) => (
            <li key={t.name}><div className="flex justify-between gap-3"><span className="min-w-0 truncate">{t.name} <span className="text-muted-foreground">× {t.qty}</span></span><span className="font-semibold tabular-nums">{formatINR(t.amount, 0)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-secondary" aria-hidden><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round(t.share * 100))}%` }} /></div></li>
          ))}</ul> : <p className="text-sm text-muted-foreground">No bills in this period.</p>}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {([["Selling more", i.rising, "text-success"], ["Selling less", i.falling, "text-destructive"]] as const).map(([title, list, tone]) => (
          <div key={title} className={card}>
            <h2 className="mb-2 text-sm font-semibold">{title} than the period before</h2>
            {list.length ? <ul className="divide-y divide-border text-sm">{list.map((m) => (
              <li key={m.name} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{m.name}</span><span className="tabular-nums"><span className="mr-3 text-muted-foreground">{m.before} → {m.qty}</span><span className={cn("font-semibold", tone)}>{m.delta > 0 ? "+" : ""}{m.delta}</span></span></li>
            ))}</ul> : <p className="text-sm text-muted-foreground">No change.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

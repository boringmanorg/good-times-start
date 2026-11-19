import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/Segmented";
import { formatINR } from "@/lib/billing";
import { formatQty } from "@/lib/stock-logic";
import { entriesBetween, itemInsight, itemPurchaseLines, spendBySupplier, spendSummary, topItems, type SpendPeriod } from "@/lib/purchase-logic";
import { PURCHASE_PAY_MODES, spendByMode } from "@/lib/purchase-pay-logic";
import type { Material, StockEntry, StockUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLORS = ["var(--primary)", "var(--gold)", "var(--accent-foreground)", "var(--destructive)", "var(--muted-foreground)", "var(--ring)"];
const MODE_COLOR: Record<string, string> = { cash: "bg-success", upi: "bg-primary", card: "bg-gold", bank: "bg-accent-foreground", credit: "bg-destructive", unrecorded: "bg-muted-foreground/40" };
const TOP = 5;
const RANGE: Record<SpendPeriod, string> = { day: "Last 14 days", week: "Last 12 weeks", month: "Last 12 months" };
const BEFORE: Record<SpendPeriod, string> = { day: "the 14 days before", week: "the 12 weeks before", month: "the 12 months before" };

export function PurchaseSpendDashboard({ entries, suppliers, materials }: { entries: StockEntry[]; suppliers: { id: string; name: string }[]; materials: Material[] }) {
  const [period, setPeriod] = useState<SpendPeriod>("day");
  const now = Date.now();
  const view = spendBySupplier(entries, suppliers, period, now);
  const from = view.buckets[0]?.start ?? now;
  const span = now - from;
  const inWindow = entriesBetween(entries, from, now + 1);
  const summary = spendSummary(inWindow);
  const previous = spendSummary(entriesBetween(entries, from - span, from));
  const change = previous.spend > 0 ? Math.round(((summary.spend - previous.spend) / previous.spend) * 100) : null;
  const modes = spendByMode(inWindow);
  const modeTotal = modes.reduce((n, m) => n + m.amount, 0);
  const items = topItems(inWindow, materials).slice(0, 8);

  const top = view.suppliers.slice(0, TOP);
  const others = view.suppliers.length > TOP;
  const data = view.buckets.map((b) => {
    const row: Record<string, number | string> = { label: b.label };
    let rest = b.total;
    for (const s of top) { row[s.key] = b.bySupplier[s.key] ?? 0; rest -= b.bySupplier[s.key] ?? 0; }
    if (others) row["others"] = Math.round(rest * 100) / 100;
    return row;
  });
  const series = [...top.map((s) => ({ key: s.key, name: s.name })), ...(others ? [{ key: "others", name: "Others" }] : [])];

  return <div className="mt-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Segmented ariaLabel="Spend period" value={period} onChange={setPeriod} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />
      <p className="text-xs text-muted-foreground">{RANGE[period]} · approved purchases, returns subtracted</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Spend" value={formatINR(summary.spend, 0)}
        note={change === null ? `${RANGE[period]}` : <span className={cn("inline-flex items-center gap-0.5", change > 0 ? "text-destructive" : "text-success")}>{change > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(change)}% vs {BEFORE[period]}</span>} />
      <Stat label="Purchase bills" value={String(summary.bills)} note={summary.bills ? `Average ${formatINR(summary.averageBill, 0)}` : "None yet"} />
      <Stat label="Pay later (vendor credit)" value={formatINR(summary.payLater, 0)} note={summary.payLater ? "Recorded as owed to vendors" : "Nothing on credit"} tone={summary.payLater ? "warn" : undefined} />
      <Stat label="Returned to vendors" value={formatINR(summary.returns, 0)} note={summary.returns ? "Already taken off spend" : "No returns"} />
    </div>

    <section aria-label="How purchases were paid" className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">How it was paid</h2>
      {modeTotal > 0 ? <>
        <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
          {modes.map((m) => <div key={m.mode} className={MODE_COLOR[m.mode]} style={{ width: `${(m.amount / modeTotal) * 100}%` }} />)}
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m) => <li key={m.mode} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2"><span className={cn("size-2.5 shrink-0 rounded-full", MODE_COLOR[m.mode])} /><span className="truncate">{m.mode === "unrecorded" ? "Not recorded (older bills)" : PURCHASE_PAY_MODES.find((x) => x.v === m.mode)?.l}</span></span>
            <span className="shrink-0 tabular-nums"><strong>{formatINR(m.amount, 0)}</strong><span className="ml-1.5 text-xs text-muted-foreground">{Math.round((m.amount / modeTotal) * 100)}%</span></span>
          </li>)}
        </ul>
      </> : <p className="py-4 text-center text-sm text-muted-foreground">No purchases in this period</p>}
    </section>

    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Spend per vendor · {RANGE[period]}</h2>
      {view.total === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No approved purchases in this period</p> :
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis width={56} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
          <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--muted)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} stackId="spend" fill={COLORS[i % COLORS.length]} />)}
        </BarChart></ResponsiveContainer></div>}
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Top vendors" className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Top vendors</h2>
        <ul className="divide-y divide-border">
          {view.suppliers.map((s) => {
            const share = view.total ? Math.round((s.amount / view.total) * 100) : 0;
            return <li key={s.key} className="px-4 py-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate font-medium">{s.name}</span><span className="shrink-0 font-semibold tabular-nums">{formatINR(s.amount, 0)}</span></div>
              <div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.max(0, share)}%` }} /></div><span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{share}%</span></div>
            </li>;
          })}
          {!view.suppliers.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">No vendors in this period</li> : null}
        </ul>
      </section>

      <section aria-label="Top items" className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Top items</h2>
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const trend = itemInsight(itemPurchaseLines(it.materialId, entries, suppliers));
            return <li key={it.materialId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{it.name}</span>
                <span className="block text-xs text-muted-foreground">{formatQty(it.qty, it.unit as StockUnit)}{trend.lastPrice !== undefined ? ` · now ${formatINR(trend.lastPrice)}/${it.unit}` : ""}</span></span>
              <span className="flex shrink-0 flex-col items-end"><span className="font-semibold tabular-nums">{formatINR(it.amount, 0)}</span><PriceChange pct={trend.changePct} /></span>
            </li>;
          })}
          {!items.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">No items bought in this period</li> : null}
        </ul>
      </section>
    </div>
  </div>;
}

/** Up in red (paying more), down in green; nothing when there's no earlier price. */
function PriceChange({ pct }: { pct: number | undefined }) {
  if (pct === undefined || pct === 0) return null;
  return <span className={cn("inline-flex items-center text-xs font-semibold tabular-nums", pct > 0 ? "text-destructive" : "text-success")}>
    {pct > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(pct)}% price
  </span>;
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: ReactNode; tone?: "warn" | undefined }) {
  return <div className={cn("rounded-2xl border bg-card p-4", tone === "warn" ? "border-gold/60" : "border-border")}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "warn" && "text-warning")}>{value}</p>
    {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
  </div>;
}

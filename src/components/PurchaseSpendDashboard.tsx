import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/Segmented";
import { formatINR } from "@/lib/billing";
import { spendBySupplier, type SpendPeriod } from "@/lib/purchase-logic";
import type { StockEntry } from "@/lib/types";

const COLORS = ["var(--primary)", "var(--gold)", "var(--accent-foreground)", "var(--destructive)", "var(--muted-foreground)", "var(--ring)"];
const TOP = 5;
const RANGE: Record<SpendPeriod, string> = { day: "Last 14 days", week: "Last 12 weeks (Mon–Sun)", month: "Last 12 months" };

export function PurchaseSpendDashboard({ entries, suppliers }: { entries: StockEntry[]; suppliers: { id: string; name: string }[] }) {
  const [period, setPeriod] = useState<SpendPeriod>("day");
  const view = spendBySupplier(entries, suppliers, period);
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
  const current = view.buckets[view.buckets.length - 1]?.total ?? 0;
  const previous = view.buckets[view.buckets.length - 2]?.total ?? 0;
  const now = period === "day" ? "Today" : period === "week" ? "This week" : "This month";
  const before = period === "day" ? "Yesterday" : period === "week" ? "Last week" : "Last month";

  return <div className="mt-4 space-y-4">
    <Segmented ariaLabel="Spend period" value={period} onChange={setPeriod} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat label={now} value={formatINR(current, 0)} />
      <Stat label={before} value={formatINR(previous, 0)} />
      <Stat label={RANGE[period]} value={formatINR(view.total, 0)} />
    </div>
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Spend per supplier · {RANGE[period]}</h2>
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
    <section className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">{now}</th><th className="px-4 py-2 text-right">{RANGE[period]}</th><th className="px-4 py-2 text-right">Share</th></tr></thead>
        <tbody>{view.suppliers.map((s) => <tr key={s.key} className="border-t border-border/60">
          <td className="px-4 py-2 font-medium">{s.name}</td>
          <td className="px-4 py-2 text-right tabular-nums">{formatINR(view.buckets[view.buckets.length - 1]?.bySupplier[s.key] ?? 0, 0)}</td>
          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatINR(s.amount, 0)}</td>
          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{view.total ? Math.round((s.amount / view.total) * 100) : 0}%</td>
        </tr>)}{!view.suppliers.length ? <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No suppliers yet</td></tr> : null}</tbody></table>
      <p className="px-4 py-2 text-xs text-muted-foreground">Approved purchases only, returns subtracted.</p>
    </section>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p></div>;
}

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { formatINR } from "@/lib/billing";
import { bySource, SOURCE_LABEL } from "@/lib/pms/bookings-logic";
import { addDays, localDate } from "@/lib/pms/dates";
import { stayStats } from "@/lib/pms/reports";
import { usePms } from "@/lib/pms/use-pms";
import { cn } from "@/lib/utils";

/** Occupancy, average rate, RevPAR and revenue by channel and room type over a period. */
export const Route = createFileRoute("/stays/reports")({
  head: () => ({ meta: [{ title: "Stay reports — XTSY" }, { name: "robots", content: "noindex" }] }),
  component: StayReports,
});

type Period = "month" | "last" | "next30" | "custom";

function range(p: Period, today: string, custom: { from: string; to: string }): { from: string; to: string } {
  const first = `${today.slice(0, 8)}01`;
  if (p === "month") { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return { from: first, to: d.toISOString().slice(0, 10) }; }
  if (p === "last") { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return { from: d.toISOString().slice(0, 10), to: first }; }
  if (p === "next30") return { from: today, to: addDays(today, 30) };
  return custom.to > custom.from ? custom : { from: custom.from, to: addDays(custom.from, 1) };
}

function StayReports() {
  const { types, units, stays } = usePms();
  const today = localDate();
  const [p, setP] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: addDays(today, -30), to: today });
  const r = range(p, today, custom);
  const stats = useMemo(() => stayStats(stays, units, r.from, r.to), [stays, units, r.from, r.to]);
  const sources = useMemo(() => bySource(stays, types, r.from, r.to), [stays, types, r.from, r.to]);
  const perType = useMemo(() => types.map((t) => ({ t, ...stayStats(stays.map((s) => ({ ...s, lines: s.lines.filter((l) => l.typeId === t.id) })).filter((s) => s.lines.length), units.filter((u) => u.typeId === t.id), r.from, r.to) })), [types, stays, units, r.from, r.to]);
  const PERIODS: { v: Period; l: string }[] = [{ v: "month", l: "This month" }, { v: "last", l: "Last month" }, { v: "next30", l: "Next 30 days" }, { v: "custom", l: "Choose dates" }];
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
        <header><p className="xt-eyebrow text-primary">Performance</p><h1 className="text-4xl">Reports</h1></header>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((x) => <button key={x.v} type="button" onClick={() => setP(x.v)} aria-pressed={p === x.v} className={cn("rounded-full px-4 py-1.5 text-sm font-bold", p === x.v ? "bg-primary text-primary-foreground" : "bg-secondary")}>{x.l}</button>)}
          {p === "custom" ? <>
            <input type="date" aria-label="From" className="h-9 rounded-xl border border-input bg-card px-2 text-sm" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <input type="date" aria-label="To" className="h-9 rounded-xl border border-input bg-card px-2 text-sm" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Occupancy" value={`${Math.round(stats.occupancyPct)}%`} sub={`${stats.soldNights} of ${stats.unitNights} bed/room-nights`} />
          <Tile label="Room revenue" value={formatINR(stats.roomRevenue, 0)} sub="before GST" />
          <Tile label="Average rate (ADR)" value={formatINR(stats.adr, 0)} />
          <Tile label="RevPAR" value={formatINR(stats.revpar, 0)} sub="revenue per available bed/room" />
          <Tile label="Nights sold" value={String(stats.soldNights)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-2xl">By channel</h2>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Channel</th><th className="py-1 text-right">Bookings</th><th className="py-1 text-right">Nights</th><th className="py-1 text-right">Revenue</th></tr></thead>
              <tbody className="divide-y divide-border">
                {sources.map((s) => <tr key={s.source}><td className="py-2">{SOURCE_LABEL[s.source]}</td><td className="py-2 text-right tabular-nums">{s.bookings}</td><td className="py-2 text-right tabular-nums">{s.nights}</td><td className="py-2 text-right tabular-nums">{formatINR(s.revenue, 0)}</td></tr>)}
                {!sources.length ? <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No stays in this period.</td></tr> : null}
              </tbody>
            </table>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-2xl">By room type</h2>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Room type</th><th className="py-1 text-right">Occupancy</th><th className="py-1 text-right">ADR</th><th className="py-1 text-right">Revenue</th></tr></thead>
              <tbody className="divide-y divide-border">
                {perType.map((x) => <tr key={x.t.id}><td className="py-2">{x.t.name}</td><td className="py-2 text-right tabular-nums">{Math.round(x.occupancyPct)}%</td><td className="py-2 text-right tabular-nums">{formatINR(x.adr, 0)}</td><td className="py-2 text-right tabular-nums">{formatINR(x.roomRevenue, 0)}</td></tr>)}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>{sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}</div>;
}

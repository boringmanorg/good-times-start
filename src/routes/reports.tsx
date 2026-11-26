import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import { LiveTotals } from "@/components/LiveTotals";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { useRestaurantSettings } from "@/lib/use-settings";
import { gstr1Workbook } from "@/lib/gstr1";
import { gstr1Pdf } from "@/lib/gstr1-pdf";
import { rangeLabel, reportsWorkbook } from "@/lib/report-excel";
import { downloadXlsx } from "@/lib/xlsx";
import { Receipt } from "@/components/Receipt";
import { BillPrintButton } from "@/components/BillPrintButton";
import { allow } from "@/lib/pin-gate";
import { usePolicy } from "@/lib/use-policy";
import { SalesSummary } from "@/components/SalesSummary";
import { ReasonPrompt } from "@/components/PaymentDialogs";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/billing";
import { isAdmin, useStaff } from "@/lib/staff";
import { voidSettledBill } from "@/lib/bill-actions";
import {
  categorySales, dailySales, untaxedSales, expectedCash, gstByRate, hourlySales, inRange, itemSales, paymentLabel,
  presetRange, salesSummary, summaryAt, seriesOf, staffSales, toCsv, type Range,
} from "@/lib/report-logic";
import { businessDayBounds, businessDayKey } from "@/lib/business-day";
import type { Order } from "@/lib/types";
import { Dropdown } from "@/components/Dropdown";
import { Segmented } from "@/components/Segmented";
import { ConfirmButton } from "@/components/ConfirmButton";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { reportOrders } from "@/lib/report-orders";
import { SummaryInsights } from "@/components/SummaryInsights";
import { useEntitlements } from "@/lib/use-entitlements";
import { featureOn } from "@/lib/plans";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Summary — XTSY POS" },
      { name: "description", content: "Sales, items, GST, staff and day-end cash for any period, with CSV export." }, { property: "og:title", content: "Summary — XTSY POS" }, { property: "og:description", content: "Sales, items, GST, staff and day-end cash for any period, with CSV export." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },],
  }),
  component: ReportsPage,
});

const PIE = ["var(--color-primary)", "var(--color-gold)", "var(--color-success)", "var(--color-destructive)", "var(--color-muted-foreground)", "var(--color-ring)"];
type Preset = "today" | "yesterday" | "7d" | "month" | "custom";
type Tab = "overview" | "insights" | "summary" | "items" | "gst" | "staff" | "bills";
const ORDER_TYPE_LABEL: Record<string, string> = { "dine-in": "Dine-in", takeaway: "Takeaway", delivery: "Delivery", swiggy: "Swiggy", zomato: "Zomato" };

function download(name: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A picked date is a business day: 6 am that day until 6 am the next (business-day.ts).
function toInputDate(at: number) { return businessDayKey(at); }
function fromInputDate(value: string, endOfDay = false) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [from, to] = businessDayBounds(value);
  return endOfDay ? to - 1 : from;
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="card-elevated relative overflow-hidden p-4">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent ?? "var(--color-primary)" }} />
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Overview({ orders, range }: { orders: Order[]; range: Range }) {
  const s = salesSummary(orders);
  const singleDay = range.to - range.from < 26 * 60 * 60 * 1000;
  const chart = singleDay
    ? hourlySales(orders).slice(6, 24).map((h) => ({ label: `${h.hour}`, net: h.net }))
    : dailySales(orders, range).map((d) => ({ label: d.day.slice(5).split("-").reverse().join("/"), net: d.net }));
  const pays = Object.entries(s.byPayment).map(([mode, value]) => ({ name: paymentLabel(mode), value }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales" value={formatINR(s.net, 0)} hint="Including GST" />
        <Stat label="Bills" value={String(s.bills)} hint={`Average ${formatINR(s.average, 0)}`} accent="var(--color-gold)" />
        <Stat label="GST collected" value={formatINR(s.cgst + s.sgst)} accent="var(--color-success)" />
        <Stat label="Discounts given" value={formatINR(s.discounts, 0)} hint={s.voids ? `${s.voids} void bill${s.voids === 1 ? "" : "s"}, ${formatINR(s.voidValue, 0)}` : "No void bills"} accent="var(--color-destructive)" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-elevated p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{singleDay ? "Sales by hour" : "Sales by day"}</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip formatter={(v: number) => formatINR(v, 0)} />
                <Bar dataKey="net" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-elevated p-4">
          <h2 className="mb-3 text-sm font-semibold">Payments</h2>
          {pays.length ? <>
            <div className="h-40">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pays} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                    {pays.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v, 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-sm">{pays.map((p, i) => <li key={p.name} className="flex justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />{p.name}</span><span className="font-semibold">{formatINR(p.value, 0)}</span></li>)}</ul>
          </> : <p className="py-16 text-center text-sm text-muted-foreground">No bills in this period</p>}
        </div>
      </div>
      <div className="card-elevated p-4">
        <h2 className="mb-2 text-sm font-semibold">Order types</h2>
        {Object.keys(s.byOrderType).length ? (
          <ul className="divide-y divide-border text-sm">
            {Object.entries(s.byOrderType).sort((a, b) => b[1].net - a[1].net).map(([type, v]) => (
              <li key={type} className="flex justify-between py-2"><span>{ORDER_TYPE_LABEL[type] ?? type}</span><span><span className="mr-4 text-muted-foreground">{v.bills} bills</span><span className="font-semibold">{formatINR(v.net, 0)}</span></span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No bills in this period.</p>}
      </div>
    </div>
  );
}

function Items({ orders, file, canExport = true }: { orders: Order[]; file: string; canExport?: boolean }) {
  const menu = useLiveQuery(() => getDb().menu.toArray(), [], []);
  const items = useMemo(() => itemSales(orders, menu), [orders, menu]);
  const categories = categorySales(items);
  const exportCsv = () => download(`${file}-items.csv`, toCsv([["Item", "Category", "Quantity", "Sales before GST"], ...items.map((i) => [i.name, i.category, i.qty, i.amount])]));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card-elevated p-4 lg:col-span-2">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Items sold</h2>{items.length && canExport ? <Button size="sm" variant="ghost" onClick={exportCsv}><Download />CSV</Button> : null}</div>
        {items.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Item</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Sales</th></tr></thead>
            <tbody className="divide-y divide-border">{items.map((i) => <tr key={i.name}><td className="py-2">{i.name}<span className="block text-xs text-muted-foreground">{i.category}</span></td><td className="text-right font-semibold">{i.qty}</td><td className="text-right">{formatINR(i.amount, 0)}</td></tr>)}</tbody>
          </table>
        ) : <p className="text-sm text-muted-foreground">No items sold in this period.</p>}
      </div>
      <div className="card-elevated p-4">
        <h2 className="mb-2 text-sm font-semibold">By category</h2>
        <ul className="divide-y divide-border text-sm">{categories.map((c) => <li key={c.category} className="flex justify-between py-2"><span>{c.category}<span className="ml-2 text-muted-foreground">{c.qty}</span></span><span className="font-semibold">{formatINR(c.amount, 0)}</span></li>)}</ul>
      </div>
    </div>
  );
}

function Gst({ orders, file }: { orders: Order[]; file: string }) {
  const rows = gstByRate(orders);
  const total = rows.reduce((t, r) => ({ taxable: t.taxable + r.taxable, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst }), { taxable: 0, cgst: 0, sgst: 0 });
  const settled = orders.filter((o) => o.status === "settled").sort((a, b) => summaryAt(a) - summaryAt(b));
  const exportBills = () => download(`${file}-bills.csv`, toCsv([
    ["Bill", "Date", "Time", "Type", "Table", "Guest phone", "Subtotal", "Discount", "Service charge", "Taxable", "CGST", "SGST", "Round off", "Total", "Payments", "Status", "Void reason", "By"],
    ...[...orders].sort((a, b) => summaryAt(a) - summaryAt(b)).map((o) => [
      o.billNo, new Date(summaryAt(o)).toLocaleDateString("en-IN"), new Date(summaryAt(o)).toLocaleTimeString("en-IN"), ORDER_TYPE_LABEL[o.orderType] ?? o.orderType,
      o.tableLabel ?? o.tableId ?? "", o.customer?.phone ?? "", o.subtotal, o.discountAmt, o.serviceCharge ?? 0, Math.round((o.subtotal - o.discountAmt + (o.serviceCharge ?? 0)) * 100) / 100,
      o.cgst, o.sgst, o.roundOff, o.total, o.payments.map((p) => `${paymentLabel(p.mode)} ${p.amount}`).join("; "), o.status, o.voidReason ?? "", o.closedBy ?? "",
    ]),
  ]));
  const settings = useRestaurantSettings();
  const untaxed = untaxedSales(orders);
  const exportGstr1 = () => {
    const first = settled[0]?.createdAt ?? Date.now();
    const last = settled[settled.length - 1]?.createdAt ?? first;
    const sameMonth = new Date(first).getMonth() === new Date(last).getMonth() && new Date(first).getFullYear() === new Date(last).getFullYear();
    const period = sameMonth
      ? new Date(first).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : `${new Date(first).toLocaleDateString("en-IN")} to ${new Date(last).toLocaleDateString("en-IN")}`;
    const { sheets } = gstr1Workbook(orders, settings, period);
    downloadXlsx(`GSTR-1-${file}`, sheets, { title: `GSTR-1 ${period}` });
  };
  const exportGstr1Pdf = async () => {
    const blob = await gstr1Pdf(orders, settings, file);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `GSTR-1-${file}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const exportGst = () => download(`${file}-gst.csv`, toCsv([["GST rate %", "Taxable value", "CGST", "SGST", "Total tax"], ...rows.map((r) => [r.rate, r.taxable, r.cgst, r.sgst, Math.round((r.cgst + r.sgst) * 100) / 100])]));
  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">GST summary</h2>
          <p className="text-xs text-muted-foreground">{settled.length ? `Bills ${settled[0]?.billNo} to ${settled[settled.length - 1]?.billNo}, across all counters. Check with your accountant before filing.` : "No settled bills in this period."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!settled.length} onClick={() => { void exportGstr1(); }}><Download />GSTR-1 (Excel)</Button>
          <Button size="sm" variant="outline" disabled={!settled.length} onClick={() => { void exportGstr1Pdf(); }}><Download />GSTR-1 (PDF)</Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => { void exportGst(); }}><Download />GST CSV</Button>
          <Button size="sm" variant="outline" disabled={!orders.length} onClick={() => { void exportBills(); }}><Download />All bills CSV</Button>
        </div>
      </div>
      {untaxed.aggregator || untaxed.other ? (
        <p className="mb-3 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
          Not in this table: {untaxed.aggregator ? `${formatINR(untaxed.aggregator, 0)} through Swiggy/Zomato (GST paid by them)` : ""}
          {untaxed.aggregator && untaxed.other ? " and " : ""}{untaxed.other ? `${formatINR(untaxed.other, 0)} of bills without GST` : ""}.
        </p>
      ) : null}
      <p className="mb-2 text-xs text-muted-foreground">For GSTR-1, choose This month or a whole month's dates above.</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Rate</th><th className="text-right font-medium">Taxable value</th><th className="text-right font-medium">CGST</th><th className="text-right font-medium">SGST</th></tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => <tr key={r.rate}><td className="py-2">{r.rate}%</td><td className="text-right">{formatINR(r.taxable)}</td><td className="text-right">{formatINR(r.cgst)}</td><td className="text-right">{formatINR(r.sgst)}</td></tr>)}
          <tr className="font-bold"><td className="py-2">Total</td><td className="text-right">{formatINR(total.taxable)}</td><td className="text-right">{formatINR(total.cgst)}</td><td className="text-right">{formatINR(total.sgst)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Staff({ orders }: { orders: Order[] }) {
  const rows = staffSales(orders);
  return (
    <div className="card-elevated p-4">
      <h2 className="mb-2 text-sm font-semibold">Bills by staff</h2>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Settled by</th><th className="text-right font-medium">Bills</th><th className="text-right font-medium">Sales</th><th className="text-right font-medium">Voids</th></tr></thead>
          <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.name}><td className="py-2">{r.name}</td><td className="text-right">{r.bills}</td><td className="text-right font-semibold">{formatINR(r.net, 0)}</td><td className={`text-right ${r.voids ? "font-semibold text-destructive" : ""}`}>{r.voids}</td></tr>)}</tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">No bills in this period. Bills settled while signed in show who settled them.</p>}
    </div>
  );
}

function ReportsPage() {
  const { user } = useStaff();
  // Sales figures are for the owner and managers; counter logins get a read-only view.
  const full = can(user, "reports.view");
  usePolicy();
  const pos = !full && can(user, "bill.settle");
  // Reception sees what Settings → Roles allows: the daily summary and/or the Sales Summary.
  const staffTabs: { v: Tab; l: string }[] = [
    ...(can(user, "reports.summary") ? [{ v: "overview" as const, l: "Overview" }, { v: "summary" as const, l: "Sales Summary" }] : []),
    // Counter (POS) logins get a read-only view of bills, items and settlement — no exports, no voids.
    ...(pos && !can(user, "reports.summary") ? [{ v: "overview" as const, l: "Overview" }] : []),
    ...(pos ? [{ v: "items" as const, l: "Items" }, { v: "bills" as const, l: "Bills" }] : []),
  ];
  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState<Range>(() => presetRange("7d"));
  const [chosenTab, setChosenTab] = useState<Tab>(full ? "overview" : staffTabs[0]?.v ?? "overview");
  const tab: Tab = full ? chosenTab : staffTabs.some((t) => t.v === chosenTab) ? chosenTab : staffTabs[0]?.v ?? "overview";
  const setTab = (t: Tab) => {
    if ((t === "summary" || (t === "overview" && !pos)) && !full) void allow(user, "reports.summary", "Open the Sales Summary").then((ok) => { if (ok) setChosenTab(t); });
    else setChosenTab(t);
  };
  const range = preset === "custom" ? custom : presetRange(preset);
  const all = useLiveQuery(() => reportOrders(range), [range.from, range.to], []);
  const orders = inRange(all, range);
  const restaurant = useRestaurantSettings().name;
  // Insights come with Pro Lite and above (the plans that carry purchases).
  const insightsOn = featureOn(useEntitlements(), "purchases");
  const exportAll = async () => {
    const db = getDb();
    downloadXlsx(`reports-${file}`, reportsWorkbook(orders, await db.menu.toArray(), range, restaurant), { title: `${restaurant} reports` });
  };
  const file = `xtsy-pos-${businessDayKey(range.from)}${businessDayKey(range.from) === businessDayKey(range.to) ? "" : `-to-${businessDayKey(range.to)}`}`;
  const presets: { v: Preset; l: string }[] = full || can(user, "reports.summary") ? [
    { v: "today", l: "Today" }, { v: "yesterday", l: "Yesterday" }, { v: "7d", l: "Last 7 days" }, { v: "month", l: "This month" }, { v: "custom", l: "Pick dates" },
  ] : [{ v: "today", l: "Today" }, { v: "yesterday", l: "Yesterday" }];
  const tabs: { v: Tab; l: string }[] = full ? [
    { v: "overview", l: "Overview" }, ...(insightsOn ? [{ v: "insights" as const, l: "Insights" }] : []), { v: "summary", l: "Sales Summary" }, { v: "items", l: "Items" }, { v: "gst", l: "GST" }, { v: "staff", l: "Staff" }, { v: "bills", l: "Bills" },
  ] : staffTabs;

  const dateChips = (
    <div role="group" aria-label="Report dates" className="flex flex-wrap items-center gap-1 rounded-xl bg-secondary/70 p-1">
      {presets.map((p) => (
        <button key={p.v} type="button" aria-pressed={preset === p.v} onClick={() => setPreset(p.v)}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", preset === p.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{p.l}</button>
      ))}
    </div>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{restaurant || "Restaurant"}</p>
            <h1 className="text-2xl font-bold tracking-tight">Summary</h1>
            <p className="text-sm text-muted-foreground">Bills from every device in the restaurant that has synced.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {full && can(user, "reports.export") ? <Button variant="outline" disabled={!orders.length} onClick={() => void exportAll()}><Download />Excel (all reports)</Button> : null}
          </div>
        </header>

        {full || pos || can(user, "reports.summary") ? <LiveTotals /> : null}

        <section aria-label="Reports" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            {tabs.length > 1 ? <Segmented ariaLabel="Report" value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t.v, label: t.l }))} /> : <span />}
            {dateChips}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Showing <strong className="font-semibold text-foreground">{presets.find((p) => p.v === preset)?.l ?? "Dates"}</strong> · {rangeLabel(range)}</span>
              {preset === "custom" ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <input type="date" aria-label="From" value={toInputDate(custom.from)} onChange={(e) => { const from = fromInputDate(e.target.value); if (from !== null) setCustom({ ...custom, from }); }} className="rounded-lg border border-input bg-card px-2 py-1" />
                  to
                  <input type="date" aria-label="To" value={toInputDate(custom.to)} onChange={(e) => { const to = fromInputDate(e.target.value, true); if (to !== null) setCustom({ ...custom, to }); }} className="rounded-lg border border-input bg-card px-2 py-1" />
                </span>
              ) : null}
          </div>

        {tab === "overview" ? <Overview orders={orders} range={range} /> : null}
        {tab === "insights" && full && insightsOn ? <SummaryInsights orders={orders} range={range} /> : null}
        {tab === "summary" ? <SalesSummary orders={orders} range={range} restaurant={restaurant} canExport={full ? can(user, "reports.export") : true} /> : null}
        {tab === "items" ? <Items orders={orders} file={file} canExport={full ? can(user, "reports.export") : false} /> : null}
        {tab === "gst" ? <Gst orders={orders} file={file} /> : null}
        {tab === "staff" ? <Staff orders={orders} /> : null}
        {tab === "bills" ? <BillsList orders={orders} /> : null}
        {!full && !staffTabs.length ? <p className="py-10 text-center text-sm text-muted-foreground">Reports aren't switched on for this login. Ask the admin.</p> : null}
        </section>
      </div>
    </AppShell>
  );
}

const STATUS_LABEL: Record<Order["status"], string> = { settled: "Settled", held: "Running", void: "Void" };

function BillsList({ orders }: { orders: Order[] }) {
  const { user } = useStaff();
  const canVoid = can(user, "bill.void");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Order | null>(null);
  const [voiding, setVoiding] = useState(false);
  const term = q.trim().toLowerCase();
  const shown = [...orders]
    .sort((a, b) => summaryAt(b) - summaryAt(a))
    .filter((o) => !term || o.billNo.toLowerCase().includes(term) || (o.customer?.phone ?? "").includes(term) || (o.tableLabel ?? o.tableId ?? "").toLowerCase() === term);
  const live = open ? orders.find((o) => o.uid === open.uid) ?? open : null;

  const doVoid = async (reason: string) => {
    if (!live) return;
    try {
      await voidSettledBill(live, reason, user?.displayName);
      toast.success(`Bill ${live.billNo} voided`);
      setVoiding(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't void this bill.");
    }
  };

  return (
    <section className="card-elevated p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Bills</h2>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill number, phone or table" className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm" />
        </div>
      </div>
      {shown.length ? (
        <ul className="divide-y divide-border">
          {shown.map((o) => (
            <li key={o.uid ?? o.billNo} className="flex items-center gap-2">
              <button type="button" onClick={() => setOpen(o)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left text-sm hover:bg-secondary/60">
                <span className="w-16 shrink-0 text-muted-foreground">{new Date(summaryAt(o)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{o.billNo}<span className="ml-2 font-normal text-muted-foreground">{o.tableLabel ?? o.tableId ?? o.orderType}</span></span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${o.status === "void" ? "bg-destructive/10 text-destructive" : o.status === "held" ? "bg-gold/25 text-warning" : "bg-secondary text-muted-foreground"}`}>{STATUS_LABEL[o.status]}</span>
                <span className={`w-20 text-right font-semibold ${o.status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatINR(o.total, 0)}</span>
              </button><BillPrintButton order={o} action="bill.reprintOld" className="shrink-0" />
            </li>
          ))}
        </ul>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">{term ? `No bills match "${q}"` : "No bills in this period."}</p>}

      <Dialog open={!!live} onOpenChange={(o) => { if (!o) { setOpen(null); setVoiding(false); } }}>
        <DialogContent className="max-h-[92vh] max-w-sm overflow-y-auto">
          {live && voiding ? (
            <ReasonPrompt title={`Void bill ${live.billNo}`} description="The bill stays in your records as void with this reason, and any tracked stock goes back."
              confirmLabel="Void this bill" onConfirm={(reason) => void doVoid(reason)} />
          ) : live ? <>
            <DialogTitle>Bill {live.billNo}</DialogTitle>
            {live.status === "void" && live.voidReason ? <p className="-mt-2 text-sm text-destructive">Void: {live.voidReason}{live.closedBy ? `, by ${live.closedBy}` : ""}</p> : null}
            <Receipt order={live} />
            <div className="flex gap-2">
              <BillPrintButton order={live} action="bill.reprintOld" size="default" className="flex-1">Reprint</BillPrintButton>
              {canVoid && live.status === "settled" ? <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setVoiding(true)}>Void</Button> : null}
            </div>
          </> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

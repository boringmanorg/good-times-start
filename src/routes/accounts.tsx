import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Ban, Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PayablesPanel } from "@/components/PayablesPanel";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { recordLedgerEntry, voidLedgerEntry } from "@/lib/ledger-actions";
import { categoryLabel, dayBook, EXPENSE_CATEGORIES, INCOME_CATEGORIES, LEDGER_MODES, modeLabel, moneyFlow, profitAndLoss, vendorPayables, type LedgerEntry, type LedgerMode } from "@/lib/ledger-logic";
import { isAdmin, useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx";

/**
 * Accounts (Enterprise / Brand): the restaurant's books from what the POS already records —
 * profit & loss, money in and out by mode, every movement in a day book — plus the two things
 * only a person knows: expenses, and paying vendors for Pay later bills. Owner/manager only.
 */
export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Accounts — XTSY POS" }, { name: "robots", content: "noindex" }] }),
  component: AccountsPage,
});

type Period = "today" | "week" | "month" | "last_month";
type View = "summary" | "expenses" | "payables" | "daybook";
const field = "mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
const signed = (n: number) => (n < 0 ? `−${formatINR(-n, 0)}` : formatINR(n, 0));
const dayInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function periodRange(p: Period, now = new Date()): { from: number; to: number; label: string } {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (p === "today") return { from: startOfDay, to: startOfDay + 86_400_000, label: now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) };
  if (p === "week") { const mon = startOfDay - ((now.getDay() + 6) % 7) * 86_400_000; return { from: mon, to: startOfDay + 86_400_000, label: "This week" }; }
  if (p === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: startOfDay + 86_400_000, label: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: from.getTime(), to: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), label: from.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

function AccountsPage() {
  const { user } = useStaff();
  const admin = isAdmin(user);
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<View>("summary");
  const range = periodRange(period);
  const orders = useLiveQuery(() => getDb().orders.where("settledAt").between(range.from, range.to, true, false).toArray(), [range.from, range.to], []);
  const entries = useLiveQuery(() => getDb().stockEntries.toArray(), [], []);
  const ledger = useLiveQuery(() => getDb().ledger.toArray(), [], [] as LedgerEntry[]);
  const suppliers = useLiveQuery(() => getDb().suppliers.toArray(), [], []);
  const pl = useMemo(() => profitAndLoss(orders, entries, ledger, range.from, range.to), [orders, entries, ledger, range.from, range.to]);
  const flow = useMemo(() => moneyFlow(orders, entries, ledger, range.from, range.to), [orders, entries, ledger, range.from, range.to]);
  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? "";
  const book = useMemo(() => dayBook(orders, entries, ledger, range.from, range.to, supplierName), [orders, entries, ledger, range.from, range.to, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps
  const owed = vendorPayables(entries, ledger, suppliers).reduce((n, v) => n + v.owed, 0);
  const by = user?.displayName ?? "Admin";

  if (!admin) return <AppShell><p className="p-6 text-sm text-muted-foreground">Accounts are for the owner and managers.</p></AppShell>;

  const exportBooks = () => downloadXlsx(`accounts-${dayInput(range.from)}`, [
    { name: "Profit & loss", title: `Profit & loss · ${range.label}`, columns: [{ header: "Line", width: 34 }, { header: "Amount", format: "inr" }], rows: [
      ["Sales before GST", pl.sales], ["GST collected (paid to government)", pl.gst], ["Purchases", pl.purchases], ["Less supplier returns", -pl.returns], ["Net purchases", pl.netPurchases],
      ["Gross profit", pl.grossProfit], ...pl.expensesByCategory.map((e): [string, number] => [`Expense: ${categoryLabel(e.category)}`, e.amount]), ["Other income", pl.otherIncome], ["Operating profit", pl.operatingProfit]] },
    { name: "Money by mode", title: `Money in and out · ${range.label}`, columns: [{ header: "Mode" }, { header: "In", format: "inr" }, { header: "Out", format: "inr" }, { header: "Net", format: "inr" }], rows: flow.map((f) => [modeLabel(f.mode), f.moneyIn, f.moneyOut, f.net]) },
    { name: "Day book", title: `Day book · ${range.label}`, columns: [{ header: "When", format: "datetime" }, { header: "What", width: 44 }, { header: "Mode" }, { header: "In", format: "inr" }, { header: "Out", format: "inr" }, { header: "Voided" }], rows: book.map((l) => [l.at, l.title, l.mode, l.moneyIn || null, l.moneyOut || null, l.voided ? "Yes" : ""]) },
  ], { title: "Accounts" });

  return <AppShell><div className="mx-auto max-w-6xl p-4 lg:p-6">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Accounts</h1><p className="text-sm text-muted-foreground">Profit, money by mode, expenses and what you owe vendors, from your bills and purchases.</p></div>
      <Button variant="outline" onClick={exportBooks}><Download />Excel</Button>
    </header>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Segmented ariaLabel="Period" size="sm" value={period} onChange={setPeriod} options={[{ value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "last_month", label: "Last month" }]} />
      <p className="text-sm text-muted-foreground">Showing {range.label}</p>
    </div>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Sales before GST" value={formatINR(pl.sales, 0)} note={`${pl.bills} bills · GST ${formatINR(pl.gst, 0)}`} />
      <Tile label="Purchases (net)" value={formatINR(pl.netPurchases, 0)} note={pl.returns ? `after ${formatINR(pl.returns, 0)} returns` : "approved bills"} />
      <Tile label="Expenses" value={formatINR(pl.expenses, 0)} note={`${pl.expensesByCategory.length} categories`} />
      <Tile label="Operating profit" value={signed(pl.operatingProfit)} note={pl.sales ? (pl.operatingProfit < 0 ? "a loss in this period" : `${Math.round((pl.operatingProfit / pl.sales) * 100)}% of sales`) : "no sales yet"} tone={pl.operatingProfit < 0 ? "bad" : "good"} />
    </div>
    <Segmented ariaLabel="Accounts view" stretch value={view} onChange={setView} options={[{ value: "summary", label: "Summary" }, { value: "expenses", label: "Expenses" }, { value: "payables", label: owed ? `Pay later · ${formatINR(owed, 0)}` : "Pay later" }, { value: "daybook", label: "Day book" }]} />
    {view === "summary" ? <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-bold">Profit &amp; loss</h2>
        <dl className="mt-3 divide-y divide-border text-sm">
          <Row l="Sales before GST" v={pl.sales} />
          <Row l="Purchases" v={-pl.purchases} />
          {pl.returns ? <Row l="Supplier returns" v={pl.returns} /> : null}
          <Row l="Gross profit" v={pl.grossProfit} strong />
          {pl.expensesByCategory.map((e) => <Row key={e.category} l={categoryLabel(e.category)} v={-e.amount} sub />)}
          {pl.otherIncome ? <Row l="Other income" v={pl.otherIncome} sub /> : null}
          <Row l="Operating profit" v={pl.operatingProfit} strong />
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">GST of {formatINR(pl.gst, 0)} collected on bills belongs to the government and isn't counted as sales. Purchases count at what was paid, including Pay later.</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-bold">Money in and out, by mode</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left font-medium">Mode</th><th className="text-right font-medium">In</th><th className="text-right font-medium">Out</th><th className="text-right font-medium">Net</th></tr></thead>
          <tbody className="divide-y divide-border">{flow.map((f) => <tr key={f.mode}><td className="py-2 font-medium">{modeLabel(f.mode)}</td><td className="text-right tabular-nums">{formatINR(f.moneyIn, 0)}</td><td className="text-right tabular-nums">{formatINR(f.moneyOut, 0)}</td><td className={cn("text-right font-semibold tabular-nums", f.net < 0 && "text-destructive")}>{signed(f.net)}</td></tr>)}
            {!flow.length ? <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No money moved in this period.</td></tr> : null}</tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">Cash net is what the drawer should have gained. Pay later moves no money until it's paid; loyalty points and gift cards aren't money.</p>
      </section>
    </div> : null}
    {view === "expenses" ? <Expenses ledger={ledger.filter((l) => l.type !== "vendor_payment" && l.at >= range.from && l.at < range.to)} by={by} /> : null}
    {view === "payables" ? <PayablesPanel entries={entries} suppliers={suppliers} by={by} /> : null}
    {view === "daybook" ? <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
      {book.map((l) => <li key={l.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5", l.voided && "text-muted-foreground line-through")}>
        <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(l.at).toLocaleString("en-IN", l.dateOnly ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{l.title}</span>
        <span className="text-xs text-muted-foreground">{l.mode}</span>
        <span className={cn("w-24 text-right font-semibold tabular-nums", l.moneyIn ? "text-success" : l.moneyOut ? "" : "text-muted-foreground")}>{l.moneyIn ? `+${formatINR(l.moneyIn, 0)}` : l.moneyOut ? `−${formatINR(l.moneyOut, 0)}` : "—"}</span>
      </li>)}
      {!book.length ? <li className="p-6 text-center text-muted-foreground">Nothing in this period.</li> : null}
    </ul> : null}
  </div></AppShell>;
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn("mt-1 text-2xl font-bold tabular-nums [overflow-wrap:anywhere]", tone === "bad" && "text-destructive", tone === "good" && "text-success")}>{value}</p><p className="text-xs text-muted-foreground">{note}</p></div>;
}

function Row({ l, v, strong, sub }: { l: string; v: number; strong?: boolean; sub?: boolean }) {
  return <div className={cn("flex justify-between gap-3 py-2", strong && "font-bold", sub && "pl-3 text-muted-foreground")}><dt>{l}</dt><dd className={cn("tabular-nums", strong && v < 0 && "text-destructive")}>{signed(v)}</dd></div>;
}

function Expenses({ ledger, by }: { ledger: LedgerEntry[]; by: string }) {
  const [adding, setAdding] = useState<"expense" | "income" | null>(null);
  const rows = [...ledger].sort((a, b) => b.at - a.at);
  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setAdding("expense")}><Plus />Expense</Button>
      <Button variant="outline" onClick={() => setAdding("income")}><Plus />Money in</Button>
    </div>
    {adding ? <EntryForm type={adding} by={by} onDone={() => setAdding(null)} /> : null}
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
      {rows.map((l) => <ExpenseRow key={l.id} l={l} by={by} />)}
      {!rows.length ? <li className="p-6 text-center text-muted-foreground">No expenses recorded in this period. Add rent, salaries, gas and the like so profit is real.</li> : null}
    </ul>
  </div>;
}

function EntryForm({ type, by, onDone }: { type: "expense" | "income"; by: string; onDone: () => void }) {
  const cats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const [category, setCategory] = useState(cats[0]!.v);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<LedgerMode>("cash");
  const [day, setDay] = useState(dayInput(Date.now()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const at = day === dayInput(Date.now()) ? Date.now() : new Date(`${day}T12:00:00`).getTime();
      await recordLedgerEntry({ type, at, by, amount: Number(amount), mode, category, ...(note.trim() ? { note } : {}) });
      toast.success(`${type === "expense" ? "Expense" : "Money in"} saved`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  };
  return <div className="rounded-2xl border border-primary/40 bg-primary-tint/30 p-4">
    <div className="grid gap-3 sm:grid-cols-5">
      <label className="text-sm font-medium sm:col-span-2">{type === "expense" ? "For" : "What"}<select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>{cats.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></label>
      <label className="text-sm font-medium">Amount (₹)<input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 10))} className={cn(field, "tabular-nums")} /></label>
      <label className="text-sm font-medium">{type === "expense" ? "Paid by" : "Came by"}<select value={mode} onChange={(e) => setMode(e.target.value as LedgerMode)} className={field}>{LEDGER_MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></label>
      <label className="text-sm font-medium">Date<input type="date" value={day} max={dayInput(Date.now())} onChange={(e) => e.target.value && setDay(e.target.value)} className={field} /></label>
      <label className="text-sm font-medium sm:col-span-5">Note <span className="font-normal text-muted-foreground">(optional)</span><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={type === "expense" ? "e.g. November rent, 2 gas cylinders" : "e.g. catering advance"} className={field} /></label>
    </div>
    <div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !(Number(amount) > 0)} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button><Button size="sm" variant="ghost" onClick={onDone}><X />Cancel</Button></div>
  </div>;
}

function ExpenseRow({ l, by }: { l: LedgerEntry; by: string }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  return <li className="px-4 py-2.5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(l.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
      <span className={cn("min-w-0 flex-1 [overflow-wrap:anywhere]", l.void && "line-through text-muted-foreground")}>{categoryLabel(l.category)}{l.note ? ` · ${l.note}` : ""}<span className="text-xs text-muted-foreground"> · {modeLabel(l.mode)} · {l.by}</span></span>
      <span className={cn("font-semibold tabular-nums", l.void && "line-through text-muted-foreground", l.type === "income" && !l.void && "text-success")}>{l.type === "income" ? "+" : "−"}{formatINR(l.amount, 0)}</span>
      {!l.void && !voiding ? <button type="button" onClick={() => setVoiding(true)} className="text-xs text-muted-foreground hover:text-destructive" aria-label="Void this entry"><Ban className="size-4" /></button> : null}
    </div>
    {l.void ? <p className="mt-0.5 text-xs text-destructive">Voided by {l.void.by}: {l.void.reason}</p> : null}
    {voiding ? <div className="mt-2 flex flex-wrap gap-2"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why is this entry wrong?" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
      <Button size="sm" variant="destructive" disabled={reason.trim().length < 4} onClick={() => void voidLedgerEntry(l.id, by, reason).then(() => { toast.success("Entry voided"); setVoiding(false); }, (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't void"))}>Void</Button>
      <Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>Keep</Button></div> : null}
  </li>;
}

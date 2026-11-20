import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Ban, Check, ChevronDown, IndianRupee, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/billing";
import { recordLedgerEntry, voidLedgerEntry } from "@/lib/ledger-actions";
import { allocateOldestFirst, LEDGER_MODES, modeLabel, vendorPayables, type LedgerEntry, type LedgerMode, type VendorOwed } from "@/lib/ledger-logic";
import { cn } from "@/lib/utils";
import type { StockEntry, Supplier } from "@/lib/types";

/**
 * Pay later → paid. What each vendor is owed on "Pay later" purchases (less returns and what has
 * been paid), oldest bill first, and recording a payment against it. Payments go to the oldest
 * bills first; anything over is kept as an advance. A wrong payment is voided with a reason.
 */
const field = "mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
const dayInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shortDay = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const daysAgo = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 86_400_000));

export function PayablesPanel({ entries, suppliers, by }: { entries: StockEntry[]; suppliers: Supplier[]; by: string }) {
  const ledger = useLiveQuery(() => getDb().ledger.where("type").equals("vendor_payment").toArray(), [], [] as LedgerEntry[]);
  const vendors = useMemo(() => vendorPayables(entries, ledger, suppliers), [entries, ledger, suppliers]);
  const total = vendors.reduce((n, v) => n + v.owed, 0);
  const oldest = vendors.reduce<number | null>((m, v) => (v.oldestAt !== null && (m === null || v.oldestAt < m) ? v.oldestAt : m), null);
  const [open, setOpen] = useState<string | null>(null);
  const payments = (id: string) => ledger.filter((l) => l.supplierId === id).sort((a, b) => b.at - a.at);
  const paidVendors = [...new Set(ledger.map((l) => l.supplierId ?? ""))].filter((id) => id && !vendors.some((v) => v.supplierId === id));

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Owed to vendors now</p><p className={cn("mt-1 text-2xl font-bold tabular-nums", total > 0 && "text-warning")}>{formatINR(total, 0)}</p><p className="text-xs text-muted-foreground">{vendors.filter((v) => v.owed > 0).length} vendor{vendors.filter((v) => v.owed > 0).length === 1 ? "" : "s"}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Oldest unpaid bill</p><p className="mt-1 text-2xl font-bold tabular-nums">{oldest === null ? "—" : `${daysAgo(oldest)} days`}</p><p className="text-xs text-muted-foreground">{oldest === null ? "Nothing owed" : `since ${shortDay(oldest)}`}</p></div>
        <div className="col-span-2 rounded-2xl border border-border bg-card p-4 lg:col-span-1"><p className="text-xs text-muted-foreground">Paid to vendors this month</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatINR(ledger.filter((l) => !l.void && l.at >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()).reduce((n, l) => n + l.amount, 0), 0)}</p><p className="text-xs text-muted-foreground">against Pay later bills</p></div>
      </div>
      {!vendors.length ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing owed. Purchases paid "Pay later" show here until they're paid.</p> : null}
      <ul className="space-y-3">
        {vendors.map((v) => <VendorCard key={v.supplierId} v={v} open={open === v.supplierId} onToggle={() => setOpen(open === v.supplierId ? null : v.supplierId)} payments={payments(v.supplierId)} by={by} />)}
      </ul>
      {paidVendors.length ? <p className="text-xs text-muted-foreground">Fully paid: {paidVendors.map((id) => suppliers.find((s) => s.id === id)?.name ?? "Vendor").join(", ")}.</p> : null}
    </div>
  );
}

function VendorCard({ v, open, onToggle, payments, by }: { v: VendorOwed; open: boolean; onToggle: () => void; payments: LedgerEntry[]; by: string }) {
  const [paying, setPaying] = useState(false);
  const unpaid = v.bills.filter((b) => b.owed > 0);
  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-secondary/50">
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        <span className="min-w-0 flex-1"><span className="block font-semibold">{v.name}</span>
          <span className="block text-xs text-muted-foreground">{unpaid.length} unpaid bill{unpaid.length === 1 ? "" : "s"}{v.oldestAt ? ` · oldest ${daysAgo(v.oldestAt)} days` : ""}{v.unallocated ? ` · advance ${formatINR(v.unallocated, 0)}` : ""}</span></span>
        <span className={cn("text-lg font-bold tabular-nums", v.owed > 0 && "text-warning")}>{formatINR(v.owed, 0)}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left font-medium">Bill</th><th className="text-right font-medium">Pay later</th><th className="hidden text-right font-medium sm:table-cell">Returned</th><th className="hidden text-right font-medium sm:table-cell">Paid</th><th className="text-right font-medium">Owed</th></tr></thead>
            <tbody className="divide-y divide-border">
              {v.bills.map((b) => (
                <tr key={b.purchase.id} className={cn(b.owed <= 0 && "text-muted-foreground")}>
                  <td className="py-1.5">{shortDay(b.purchase.at)}{b.purchase.reference ? ` · #${b.purchase.reference}` : ""}</td>
                  <td className="text-right tabular-nums">{formatINR(b.credit, 0)}</td>
                  <td className="hidden text-right tabular-nums sm:table-cell">{b.returned ? `−${formatINR(b.returned, 0)}` : "—"}</td>
                  <td className="hidden text-right tabular-nums sm:table-cell">{b.paid ? `−${formatINR(b.paid, 0)}` : "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{b.owed > 0 ? formatINR(b.owed, 0) : <span className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" />Paid</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {paying ? <PayForm v={v} by={by} onDone={() => setPaying(false)} /> : (v.owed > 0 ? <Button size="sm" onClick={() => setPaying(true)}><IndianRupee />Record a payment</Button> : null)}
          {payments.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
              <ul className="mt-1 divide-y divide-border text-sm">{payments.map((p) => <PaymentRow key={p.id} p={p} by={by} />)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PayForm({ v, by, onDone }: { v: VendorOwed; by: string; onDone: () => void }) {
  const [amount, setAmount] = useState(String(v.owed));
  const [mode, setMode] = useState<LedgerMode>("upi");
  const [day, setDay] = useState(dayInput(Date.now()));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const value = Number(amount || 0);
  const plan = allocateOldestFirst(v.bills, value);
  const extra = Math.round((value - plan.reduce((n, a) => n + a.amount, 0)) * 100) / 100;
  const billLabel = (id: string) => { const b = v.bills.find((x) => x.purchase.id === id); return b ? `${shortDay(b.purchase.at)}${b.purchase.reference ? ` #${b.purchase.reference}` : ""}` : "bill"; };
  const save = async () => {
    setBusy(true);
    try {
      const at = day === dayInput(Date.now()) ? Date.now() : new Date(`${day}T12:00:00`).getTime();
      await recordLedgerEntry({ type: "vendor_payment", at, by, amount: value, mode, supplierId: v.supplierId, supplierName: v.name, allocations: plan, ...(reference.trim() ? { reference } : {}) });
      toast.success(`${formatINR(value, 0)} paid to ${v.name}`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the payment"); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-primary/40 bg-primary-tint/30 p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-medium">Amount (₹)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 10))} className={cn(field, "tabular-nums")} /></label>
        <label className="text-sm font-medium">Paid by<select value={mode} onChange={(e) => setMode(e.target.value as LedgerMode)} className={field}>{LEDGER_MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></label>
        <label className="text-sm font-medium">Date<input type="date" value={day} max={dayInput(Date.now())} onChange={(e) => e.target.value && setDay(e.target.value)} className={field} /></label>
        <label className="text-sm font-medium">Reference <span className="font-normal text-muted-foreground">(optional)</span><input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." className={field} /></label>
      </div>
      {value > 0 ? <p className="mt-2 text-xs text-muted-foreground">Clears {plan.map((a) => `${billLabel(a.purchaseId)} ${formatINR(a.amount, 0)}`).join(", ") || "nothing"}{extra > 0 ? ` · ${formatINR(extra, 0)} kept as an advance` : ""}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy || !(value > 0)} onClick={() => void save()}><Wallet />{busy ? "Saving…" : `Save payment ${value > 0 ? formatINR(value, 0) : ""}`}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}><X />Cancel</Button>
      </div>
    </div>
  );
}

function PaymentRow({ p, by }: { p: LedgerEntry; by: string }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const run = async () => {
    try { await voidLedgerEntry(p.id, by, reason); toast.success("Payment voided"); setVoiding(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't void"); }
  };
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("font-semibold tabular-nums", p.void && "line-through text-muted-foreground")}>{formatINR(p.amount, 0)}</span>
        <span className="text-muted-foreground">{shortDay(p.at)} · {modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ""} · {p.by}</span>
        {p.void ? <span className="text-xs text-destructive">Voided: {p.void.reason}</span>
          : !voiding ? <button type="button" onClick={() => setVoiding(true)} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Ban className="size-3.5" />Void</button> : null}
      </div>
      {voiding ? <div className="mt-2 flex flex-wrap gap-2"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why is this payment wrong?" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
        <Button size="sm" variant="destructive" disabled={reason.trim().length < 4} onClick={() => void run()}>Void payment</Button><Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>Keep</Button></div> : null}
    </li>
  );
}

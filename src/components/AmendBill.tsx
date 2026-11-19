import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { formatINR } from "@/lib/billing";
import { PAYMENT_MODES, roundOffOffer } from "@/lib/payment-logic";
import { AMEND_MODES, REASON_MAX, amendDeadline, amendTotals, amendedBill, paymentsText } from "@/lib/bill-amend-logic";
import { saveAmendment } from "@/lib/bill-amend";
import type { Order, PaymentMode } from "@/lib/types";

const label = (m: PaymentMode) => PAYMENT_MODES.find((p) => p.v === m)?.l ?? m;
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const field = "rounded-lg border border-input bg-card px-3 py-2 text-sm";

/** Earlier corrections on a bill, newest last. */
export function AmendmentHistory({ order }: { order: Order }) {
  if (!order.amendments?.length) return null;
  return (
    <ul aria-label="Corrections" className="mb-3 space-y-2 text-xs">
      {order.amendments.map((a, i) => (
        <li key={i} className="rounded-lg border border-border p-2">
          <div className="font-semibold">Corrected {when(a.at)} by {a.by}</div>
          <div className="text-muted-foreground">“{a.reason}”</div>
          <div className="mt-1 tabular-nums">{paymentsText(a.from.payments, label)} ({formatINR(a.from.total, 0)}) → {paymentsText(a.to.payments, label)} ({formatINR(a.to.total, 0)})</div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Admin correction of a settled bill's payments, discount and round-off.
 * Items, bill number and settlement time stay as they were.
 */
export function AmendBillForm({ order, by, onDone }: { order: Order; by: string; onDone: () => void }) {
  const [discount, setDiscount] = useState(String(order.discountPct ?? 0));
  const pct = Number(discount);
  const fresh = amendTotals(order, Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0);
  const [rows, setRows] = useState<{ mode: PaymentMode; amount: string }[]>(
    order.payments.length ? order.payments.map((p) => ({ mode: p.mode, amount: String(p.amount) })) : [{ mode: "cash", amount: "" }],
  );
  const [payTotal, setPayTotal] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPayTotal(null); }, [fresh.total]);

  const payments = rows.map((r) => ({ mode: r.mode, amount: Number(r.amount) || 0 }));
  const offer = payTotal === null ? roundOffOffer(payments, fresh.total, fresh.roundOff) : null;
  const total = payTotal ?? fresh.total;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const diff = Math.round((paid - total) * 100) / 100;
  const editRows = (next: typeof rows) => { setPayTotal(null); setRows(next); };
  const deadline = amendDeadline(order);

  const save = async () => {
    const result = amendedBill(order, { discountPct: pct, payments, payTotal, reason }, by, true, Date.now());
    if (typeof result === "string") { toast.error(result); return; }
    setBusy(true);
    try {
      await saveAmendment(result);
      toast.success(`${order.billNo} corrected`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the correction");
    } finally { setBusy(false); }
  };

  return (
    <section aria-label={`Correct ${order.billNo}`} className="mb-3 space-y-3 rounded-lg border border-primary/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">Correct payment</div>
          <div className="text-xs text-muted-foreground">Items and the bill number stay the same.{deadline ? ` Open until ${when(deadline)}.` : ""}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Cancel correction" onClick={onDone}><X className="size-4" /></Button>
      </div>

      <label className="flex items-center justify-between gap-3">
        <span>Discount %</span>
        <input aria-label="Discount %" inputMode="decimal" className={`${field} w-24 text-right`} value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </label>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select aria-label="Payment mode" className={`${field} w-32 shrink-0`} value={r.mode} onChange={(e) => editRows(rows.map((x, j) => j === i ? { ...x, mode: e.target.value as PaymentMode } : x))}>
              {AMEND_MODES.map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
            <input aria-label="Amount" inputMode="decimal" className={`${field} min-w-0 flex-1 text-right tabular-nums`} value={r.amount} placeholder="0" onChange={(e) => editRows(rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
            <Button variant="ghost" size="icon" aria-label="Remove payment" onClick={() => editRows(rows.filter((_, j) => j !== i))}><X className="size-4" /></Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-auto min-h-8 whitespace-normal" onClick={() => editRows([...rows, { mode: rows.some((x) => x.mode === "cash") ? "upi" : "cash", amount: diff < 0 ? String(-diff) : "" }])}><Plus />Add payment</Button>
          {offer ? <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal text-left" onClick={() => setPayTotal(offer.payTotal)}>Round off {offer.adjust > 0 ? "+" : "−"}{formatINR(Math.abs(offer.adjust))} · bill {formatINR(offer.payTotal)}</Button> : null}
        </div>
      </div>

      <div className="space-y-1 rounded-lg bg-secondary p-3">
        <div className="flex justify-between text-muted-foreground"><span>Was</span><span className="tabular-nums">{formatINR(order.total)} · {paymentsText(order.payments, label)}</span></div>
        {payTotal !== null ? <div className="flex justify-between text-muted-foreground"><span>Round off <button type="button" className="inline-control ml-1 inline-flex items-center underline pointer-coarse:min-h-11 pointer-coarse:px-2" onClick={() => setPayTotal(null)}>Undo</button></span><span>{payTotal - fresh.total < 0 ? "−" : "+"}{formatINR(Math.abs(payTotal - fresh.total))}</span></div> : null}
        <div className="flex justify-between font-semibold"><span>New bill</span><span className="tabular-nums">{formatINR(total)}</span></div>
        <div className="flex justify-between"><span>Payments</span><span className="tabular-nums">{formatINR(paid)}</span></div>
        {diff !== 0 ? <div className="flex justify-between font-semibold text-destructive"><span>{diff < 0 ? "Short" : "Over"}</span><span className="tabular-nums">{formatINR(Math.abs(diff))}</span></div> : null}
      </div>

      <label className="block">
        <span className="mb-1 block">Reason <span className="text-muted-foreground">(required)</span></span>
        <textarea aria-label="Reason" maxLength={REASON_MAX} rows={2} className={`${field} w-full`} value={reason} placeholder="e.g. Guest paid by GPay, settled as cash by mistake" onChange={(e) => setReason(e.target.value)} />
      </label>

      <Button className="w-full" disabled={busy || diff !== 0 || reason.trim().length < 3} onClick={() => void save()}>
        {busy ? "Saving…" : `Save correction · ${formatINR(total)}`}
      </Button>
    </section>
  );
}

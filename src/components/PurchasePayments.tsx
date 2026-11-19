import { Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { formatINR } from "@/lib/billing";
import { PURCHASE_PAY_MODES, purchaseRoundOffOffer, type PurchasePayMode } from "@/lib/purchase-pay-logic";

export interface PayRow { mode: PurchasePayMode; amount: string }

const field = "rounded-lg border border-input bg-card px-3 py-2.5 text-sm";
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How the purchase was paid: one or more methods (split), and a round-off when the
 * amount paid differs from the bill by up to ₹100. No bank accounts, only the method.
 */
export function PurchasePayments({ total, rows, onRows, roundOff, onRoundOff }: {
  total: number; rows: PayRow[]; onRows: (rows: PayRow[]) => void;
  roundOff: number; onRoundOff: (r: number) => void;
}) {
  const payments = rows.map((r) => ({ mode: r.mode, amount: Number(r.amount) || 0 }));
  const paid = r2(payments.reduce((n, p) => n + p.amount, 0));
  const due = r2(total + roundOff);
  const diff = r2(paid - due);
  const offer = roundOff === 0 ? purchaseRoundOffOffer(total, payments) : null;
  const edit = (next: PayRow[]) => { onRoundOff(0); onRows(next); };

  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">Payment</legend>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <select aria-label="Payment method" className={`${field} w-36 shrink-0 sm:w-48`} value={r.mode}
            onChange={(e) => edit(rows.map((x, j) => (j === i ? { ...x, mode: e.target.value as PurchasePayMode } : x)))}>
            {PURCHASE_PAY_MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <input aria-label="Amount paid" inputMode="decimal" placeholder="0" className={`${field} min-w-0 flex-1 text-right tabular-nums`} value={r.amount}
            onChange={(e) => edit(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          {rows.length > 1 ? <Button type="button" size="icon" variant="ghost" aria-label="Remove payment" onClick={() => edit(rows.filter((_, j) => j !== i))}><X /></Button> : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="ghost" className="h-auto min-h-8 whitespace-normal"
          onClick={() => edit([...rows, { mode: rows.some((x) => x.mode === "cash") ? "upi" : "cash", amount: diff < 0 ? String(-diff) : "" }])}>
          <Plus />Split payment
        </Button>
        {offer !== null ? (
          <Button type="button" size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-left" onClick={() => onRoundOff(offer)}>
            Round off {offer > 0 ? "+" : "−"}{formatINR(Math.abs(offer))} · paid {formatINR(paid)}
          </Button>
        ) : null}
      </div>
      <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
        <div className="flex justify-between"><span>Items</span><span className="tabular-nums">{formatINR(total)}</span></div>
        {roundOff !== 0 ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Round off <button type="button" className="inline-control ml-1 inline-flex items-center underline pointer-coarse:min-h-11 pointer-coarse:px-2" onClick={() => onRoundOff(0)}>Undo</button></span>
            <span className="tabular-nums">{roundOff < 0 ? "−" : "+"}{formatINR(Math.abs(roundOff))}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold"><span>Bill</span><span className="tabular-nums">{formatINR(due)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{formatINR(paid)}</span></div>
        {diff !== 0 ? <div className="flex justify-between font-semibold text-destructive"><span>{diff < 0 ? "Still to account for" : "Over the bill"}</span><span className="tabular-nums">{formatINR(Math.abs(diff))}</span></div> : null}
        {payments.some((p) => p.mode === "credit" && p.amount > 0) ? <p className="text-xs text-muted-foreground">“Pay later” is owed to the vendor and shows as due on the Spend dashboard.</p> : null}
      </div>
    </fieldset>
  );
}

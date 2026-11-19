import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DialogTitle } from "@/components/ui/dialog";
import { computeTotals, formatINR, upiLink, type TaxOptions } from "@/lib/billing";
import { splitLines } from "@/lib/bill-splitting";
import { PAYMENT_MODES, paymentSummary, roundOffOffer, type Payment } from "@/lib/payment-logic";
import type { CartLine, PaymentMode } from "@/lib/types";
import { Dropdown } from "@/components/Dropdown";
import { Segmented } from "@/components/Segmented";
import { ConfirmButton } from "@/components/ConfirmButton";
import { cn } from "@/lib/utils";
import { GiftCardTender } from './GiftCardTender';
import { giftPaymentProblem } from '@/lib/gift-card-checkout-logic';

/** Shows a UPI QR for the exact amount so the guest can pay from their phone. */
export function UpiPay({ vpa, payee, amount, billNo, onPaid }: { vpa: string; payee: string; amount: number; billNo: string; onPaid: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    QRCode.toDataURL(upiLink({ vpa, name: payee, amount, billNo }), { width: 240, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [vpa, payee, amount, billNo]);
  return (
    <div className="text-center">
      <DialogTitle>Scan to pay {formatINR(amount, 0)}</DialogTitle>
      {qr ? <img src={qr} alt={`UPI QR for ${formatINR(amount, 0)} to ${vpa}`} width={240} height={240} className="mx-auto mt-4 rounded-lg border border-border bg-white p-2" />
        : <div className="mx-auto mt-4 size-60 rounded-lg bg-secondary" />}
      <p className="mt-2 text-sm text-muted-foreground">Paying {payee} at {vpa}</p>
      <Button className="mt-5 w-full" onClick={onPaid}>Payment received</Button>
      <p className="mt-2 text-xs text-muted-foreground">Check the payment on your UPI app before confirming.</p>
    </div>
  );
}

/** Extra rules on top of the totals: points can't exceed the balance, and dues need a known guest. */
function paymentRuleError(entries: Payment[], pointsAvailable: number, hasCustomer: boolean): string {
  const giftError = giftPaymentProblem(entries);
  if (giftError) return giftError;
  const points = entries.filter((e) => e.mode === "points").reduce((s, e) => s + Math.max(0, e.amount), 0);
  if (points > pointsAvailable) return `The guest has ${pointsAvailable} points to spend.`;
  if (!hasCustomer && entries.some((e) => e.mode === "credit" && e.amount > 0)) return "Add the guest's phone number on the bill to record a due.";
  return "";
}

/** ₹1,162 for whole rupees, ₹1,162.40 otherwise. */
const rupees = (n: number) => formatINR(n, Number.isInteger(n) ? 0 : 2);

function PaymentRows({ total, entries, setEntries, pointsAvailable, hasCustomer, allowedModes, restaurantId, billTotal, autoRoundOff, payTotal, setPayTotal }: {
  total: number; entries: Payment[]; setEntries: (next: Payment[]) => void; pointsAvailable: number; hasCustomer: boolean; allowedModes?: PaymentMode[] | undefined;
  restaurantId?: string | null | undefined;
  /** The bill before any round-off the cashier chose, and its automatic round-off. */
  billTotal: number; autoRoundOff: number;
  payTotal: number | null; setPayTotal: (n: number | null) => void;
}) {
  const offer = payTotal === null ? roundOffOffer(entries, billTotal, autoRoundOff) : null;
  const summary = paymentSummary(entries, total);
  const ruleError = paymentRuleError(entries, pointsAvailable, hasCustomer);
  const modes = PAYMENT_MODES.filter((m) => (!allowedModes || allowedModes.includes(m.v) || entries.some((e) => e.mode === m.v))
    && (m.v !== "points" || pointsAvailable > 0 || entries.some((e) => e.mode === "points")));
  const update = (index: number, change: Partial<Payment>) => setEntries(entries.map((p, i) => (i === index ? { ...p, ...change } : p)));
  return (
    <div>
      <div className="space-y-2">
        {entries.map((p, index) => (
          <div key={index}>
          <div className="flex gap-2">
            <Dropdown ariaLabel="Payment mode" className="w-36 shrink-0" value={p.mode} onChange={(mode) => update(index, { mode })}
              options={modes.map((m) => ({ value: m.v, label: m.l, ...(m.v === "points" ? { hint: `${pointsAvailable} pts` } : {}) }))} />
            <input aria-label="Amount" inputMode="decimal" value={Number.isFinite(p.amount) && p.amount !== 0 ? String(p.amount) : ""}
              onChange={(e) => update(index, { amount: Number(e.target.value) || 0 })} placeholder="0"
              className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-right text-sm" />
            {entries.length > 1 ? <Button type="button" size="icon" variant="ghost" aria-label="Remove payment" onClick={() => setEntries(entries.filter((_, i) => i !== index))}><X /></Button> : null}
          </div>
          {p.mode === 'gift_card' ? <GiftCardTender payment={p} onChange={change => update(index, change)} restaurantId={restaurantId} /> : null}
          </div>
        ))}
      </div>
      {summary.remaining > 0 || offer ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {summary.remaining > 0 ? (
            <Button type="button" size="sm" variant="ghost" className="h-auto min-h-8 whitespace-normal text-left" onClick={() => setEntries([...entries, { mode: entries.some((e) => e.mode === "cash") ? "upi" : "cash", amount: summary.remaining }])}>
              <Plus />Add {formatINR(summary.remaining)} by another mode
            </Button>
          ) : null}
          {offer ? (
            <Button type="button" size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-left" onClick={() => setPayTotal(offer.payTotal)}>
              Round off {offer.adjust > 0 ? "+" : "−"}{rupees(Math.abs(offer.adjust))} · settle at {rupees(offer.payTotal)}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 space-y-1 rounded-lg bg-secondary p-3 text-sm">
        {payTotal !== null ? (
          <div className="flex justify-between text-muted-foreground"><span>Round off <button type="button" className="inline-control ml-1 inline-flex items-center underline pointer-coarse:min-h-11 pointer-coarse:px-2" onClick={() => setPayTotal(null)}>Undo</button></span><span>{total - billTotal < 0 ? "−" : "+"}{formatINR(Math.abs(total - billTotal))}</span></div>
        ) : null}
        <div className="flex justify-between"><span>Bill</span><span className="font-semibold">{formatINR(total)}</span></div>
        <div className="flex justify-between"><span>Received</span><span>{formatINR(summary.tendered)}</span></div>
        {summary.remaining > 0 ? <div className="flex justify-between font-semibold text-destructive"><span>Still due</span><span>{formatINR(summary.remaining)}</span></div> : null}
        {summary.change > 0 ? <div className="flex justify-between text-base font-bold"><span>Change to return</span><span>{formatINR(summary.change)}</span></div> : null}
        {summary.error || ruleError ? <p role="alert" className="text-destructive">{summary.error || ruleError}</p> : null}
      </div>
    </div>
  );
}

/**
 * Settle with several payment modes (cash and UPI, say), or split the bill so
 * some guests pay for their items now and the rest stays on the table.
 */
export function PaymentPanel({ lines, discountPct, serviceChargePct, tax = {}, canSplitBill, pointsAvailable = 0, hasCustomer = false, allowedModes, onSettle, onSettlePart, initialGiftCard = false, restaurantId }: {
  lines: CartLine[];
  discountPct: number;
  serviceChargePct: number;
  tax?: TaxOptions;
  canSplitBill: boolean;
  /** Payment modes this restaurant accepts; all when left out. */
  allowedModes?: PaymentMode[] | undefined;
  pointsAvailable?: number;
  hasCustomer?: boolean;
  initialGiftCard?: boolean;
  restaurantId?: string | null | undefined;
  /** roundTo: the cashier rounded the bill to what the guest paid (seen = the total on screen). */
  onSettle: (payments: Payment[], roundTo?: { seen: number; pay: number }) => void | Promise<void>;
  onSettlePart: (quantities: Record<string, number>, payments: Payment[], roundTo?: { seen: number; pay: number }) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<"pay" | "split">("pay");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const splitTotal = useMemo(() => {
    const { split } = splitLines(lines, quantities);
    const t = computeTotals(split, discountPct, serviceChargePct, tax);
    return { count: split.reduce((s, l) => s + l.qty, 0), total: t.total, roundOff: t.roundOff };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tax rules are fixed for an open bill
  }, [discountPct, lines, quantities, serviceChargePct]);
  const whole = computeTotals(lines, discountPct, serviceChargePct, tax);
  const billTotal = tab === "pay" ? whole.total : splitTotal.total;
  const autoRoundOff = tab === "pay" ? whole.roundOff : splitTotal.roundOff;
  const [entries, setEntriesRaw] = useState<Payment[]>([{ mode: initialGiftCard ? 'gift_card' : 'cash', amount: billTotal }]);
  // A round-off belongs to the amounts it was offered for: editing a payment drops it.
  const [payTotal, setPayTotal] = useState<number | null>(null);
  const setEntries = (next: Payment[]) => { setPayTotal(null); setEntriesRaw(next); };
  useEffect(() => { setPayTotal(null); setEntriesRaw([{ mode: initialGiftCard ? 'gift_card' : 'cash', amount: billTotal }]); }, [billTotal, initialGiftCard]);
  const total = payTotal ?? billTotal;
  const roundTo = payTotal !== null ? { seen: billTotal, pay: payTotal } : undefined;
  const [busy, setBusy] = useState(false);
  const summary = paymentSummary(entries, total);

  return (
    <div>
      <DialogTitle>Take payment</DialogTitle>
      {canSplitBill ? (
        <Segmented ariaLabel="Payment" stretch className="mt-3" value={tab} onChange={setTab}
          options={[{ value: "pay" as const, label: "Whole bill" }, { value: "split" as const, label: "Split the bill" }]} />
      ) : null}

      {tab === "split" ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">Choose what this guest is paying for. Everything else stays on the table.</p>
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {lines.map((l) => {
              const q = quantities[l.itemId] ?? 0;
              const set = (n: number) => setQuantities({ ...quantities, [l.itemId]: Math.max(0, Math.min(l.qty, n)) });
              return (
                <li key={l.itemId} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.name} <span className="text-muted-foreground">of {l.qty}</span></span>
                  <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => set(q - 1)} className="rounded-md border border-input p-1"><Minus className="size-3.5" /></button>
                  <span className="w-6 text-center font-semibold">{q}</span>
                  <button type="button" aria-label={`More ${l.name}`} onClick={() => set(q + 1)} className="rounded-md border border-input p-1"><Plus className="size-3.5" /></button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        {tab === "split" && splitTotal.count === 0
          ? <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Pick items above to see this guest's share.</p>
          : <PaymentRows total={total} entries={entries} setEntries={setEntries} pointsAvailable={pointsAvailable} hasCustomer={hasCustomer} restaurantId={restaurantId} billTotal={billTotal} autoRoundOff={autoRoundOff} payTotal={payTotal} setPayTotal={setPayTotal} allowedModes={tab === 'split' ? (allowedModes ?? PAYMENT_MODES.map(m => m.v)).filter(m => m !== 'gift_card') : allowedModes} />}
      </div>

      <ConfirmButton id="settle-panel" className={cn(buttonVariants(), "mt-4 h-11 w-full")} armedClassName="!bg-gold !text-gold-foreground"
        disabled={busy || !summary.complete || !!paymentRuleError(entries, pointsAvailable, hasCustomer) || (tab === "split" && splitTotal.count === 0)}
        onConfirm={async () => { setBusy(true); try { await (tab === 'pay' ? onSettle(entries, roundTo) : onSettlePart(quantities, entries, roundTo)); } finally { setBusy(false); } }}
        confirm={`Tap again to settle ${formatINR(total, 0)}`}>
        {tab === "pay" ? `Settle ${formatINR(total, 0)}` : `Settle ${splitTotal.count} item${splitTotal.count === 1 ? "" : "s"}, ${formatINR(total, 0)}`}
      </ConfirmButton>
    </div>
  );
}

const CANCEL_REASONS = ["Guest left before food", "Order entered by mistake", "Kitchen couldn't make it", "Duplicate order"];

/** Ask why a bill is being cancelled or voided; the reason stays with the bill. */
export function ReasonPrompt({ title, description, confirmLabel, onConfirm }: { title: string; description: string; confirmLabel: string; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div>
      <DialogTitle>{title}</DialogTitle>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CANCEL_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${reason === r ? "border-primary bg-primary-tint" : "border-border"}`}>{r}</button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-medium">Reason
        <input value={reason} maxLength={140} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm" />
      </label>
      <Button variant="destructive" className="mt-4 w-full" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { ChevronDown, ReceiptText, Undo2 } from "lucide-react";
import { formatINR } from "@/lib/billing";
import { formatQty } from "@/lib/stock-logic";
import { approvalStatus, entryAmount } from "@/lib/purchase-logic";
import { PURCHASE_PAY_MODES } from "@/lib/purchase-pay-logic";
import type { StockEntry, StockUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHOW = 5;
const MODE_DOT: Record<string, string> = { cash: "bg-success", upi: "bg-primary", card: "bg-gold", bank: "bg-accent-foreground", credit: "bg-destructive" };
const when = (at: number) => `${new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, ${new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;

/**
 * One supplier bill (or return) as an itemized receipt card: vendor, invoice, date and total on
 * top; how it was paid; every item with quantity × price and amount; actions at the foot.
 */
export function PurchaseBillCard({ entry, vendor, lineName, lineUnit, against, status, actions, children }: {
  entry: StockEntry;
  vendor: string;
  lineName: (i: StockEntry["items"][number]) => string;
  lineUnit: (i: StockEntry["items"][number]) => StockUnit;
  /** For a return: the purchase it was made against. */
  against?: string | undefined;
  /** Approval chip, rendered by the page. */
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const isReturn = entry.type === "return";
  const rejected = approvalStatus(entry) === "rejected";
  const lines = all ? entry.items : entry.items.slice(0, SHOW);
  const amount = entryAmount(entry);
  const qtyTotal = entry.items.length;

  return (
    <article aria-label={`${isReturn ? "Supplier return" : "Purchase"} from ${vendor}`}
      className={cn("overflow-hidden rounded-2xl border bg-card", isReturn ? "border-destructive/40" : "border-border", rejected && "opacity-70")}>
      <header className="flex items-start gap-3 p-4 pb-3">
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", isReturn ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
          {isReturn ? <Undo2 className="size-5" /> : <ReceiptText className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-base font-semibold">{vendor}</h3>
            {isReturn ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">Return</span> : null}
            {status}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.reference ? <span className="font-medium text-foreground">#{entry.reference}</span> : <span>No invoice no.</span>}
            {" · "}{when(entry.at)}{entry.by ? ` · ${entry.by}` : ""}
          </p>
          {isReturn && against ? <p className="mt-0.5 text-xs text-muted-foreground">Against purchase {against}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-lg font-bold tabular-nums", isReturn && "text-destructive", rejected && "line-through")}>{isReturn ? "−" : ""}{formatINR(Math.abs(amount))}</p>
          <p className="text-[11px] text-muted-foreground">{qtyTotal} {qtyTotal === 1 ? "item" : "items"}</p>
        </div>
      </header>

      {!isReturn ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
          {entry.payments?.length ? entry.payments.map((pay, i) => (
            <span key={i} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              pay.mode === "credit" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-secondary")}>
              <span className={cn("size-2 rounded-full", MODE_DOT[pay.mode])} />
              {PURCHASE_PAY_MODES.find((m) => m.v === pay.mode)?.short ?? pay.mode}
              <span className="tabular-nums">{formatINR(pay.amount)}</span>
            </span>
          )) : <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">Payment not recorded</span>}
          {entry.roundOff ? <span className="text-xs text-muted-foreground">Round off {entry.roundOff > 0 ? "+" : "−"}{formatINR(Math.abs(entry.roundOff))}</span> : null}
        </div>
      ) : null}

      <ul className="border-t border-border bg-secondary/30 px-4">
        {lines.map((i, index) => {
          const qty = Math.abs(i.qty);
          return (
            <li key={index} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/70 py-2 last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-sm">{lineName(i)}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{formatQty(qty, lineUnit(i))} × {i.unitCost !== undefined ? formatINR(i.unitCost) : "—"}</span>
              </span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", isReturn && "text-destructive")}>{formatINR(qty * (i.unitCost ?? 0))}</span>
            </li>
          );
        })}
        {entry.items.length > SHOW ? (
          <li>
            <button type="button" onClick={() => setAll(!all)} className="inline-control flex w-full items-center justify-center gap-1 py-2 text-xs font-medium text-primary pointer-coarse:min-h-11">
              {all ? "Show fewer" : `Show all ${entry.items.length} items`}<ChevronDown className={cn("size-3.5 transition-transform", all && "rotate-180")} />
            </button>
          </li>
        ) : null}
      </ul>

      {children ? <div className="border-t border-border px-4 pb-3">{children}</div> : null}
      {actions ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2.5">{actions}</footer> : null}
    </article>
  );
}

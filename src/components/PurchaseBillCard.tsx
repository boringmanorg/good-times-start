import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ReceiptText, Undo2 } from "lucide-react";
import { formatINR } from "@/lib/billing";
import { formatQty } from "@/lib/stock-logic";
import { approvalStatus, entryAmount, purchaseTime } from "@/lib/purchase-logic";
import { PURCHASE_PAY_MODES } from "@/lib/purchase-pay-logic";
import type { StockEntry, StockUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHOW = 5;
const MODE_DOT: Record<string, string> = { cash: "bg-success", upi: "bg-primary", card: "bg-gold", bank: "bg-accent-foreground", credit: "bg-destructive" };
const time = (at: number) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const day = (at: number) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * One supplier bill (or return) as a list row: vendor, invoice, time, how it was paid and the
 * total. Click to open the itemized receipt — every item with quantity × price and amount —
 * and the actions. Rows sit in a list container (`divide-y`), so the row has no border of its own.
 */
export function PurchaseBillCard({ entry, vendor, lineName, lineUnit, against, status, actions, children, defaultOpen = false, showDate = true }: {
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
  /** Start opened (bills waiting for approval, so the approve panel shows). */
  defaultOpen?: boolean;
  /** Under a day heading the date is already said: show the time only. */
  showDate?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const isReturn = entry.type === "return";
  const rejected = approvalStatus(entry) === "rejected";
  const lines = all ? entry.items : entry.items.slice(0, SHOW);
  const amount = entryAmount(entry);
  const qtyTotal = entry.items.length;
  const clock = purchaseTime(entry);

  const paidBy = entry.payments?.length ? [...new Set(entry.payments.map((pay) => PURCHASE_PAY_MODES.find((m) => m.v === pay.mode)?.short ?? pay.mode))].join(" + ") : "Payment not recorded";

  return (
    <article aria-label={`${isReturn ? "Supplier return" : "Purchase"} from ${vendor}`}
      className={cn("relative", isReturn && "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-destructive", open && "bg-secondary/30", rejected && "opacity-70")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-secondary/50 sm:px-4">
        <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span aria-hidden className={cn("hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex", isReturn ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
          {isReturn ? <Undo2 className="size-4" /> : <ReceiptText className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-semibold">{vendor}</span>
            {isReturn ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">Return</span> : null}
            {status}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground sm:truncate">
            {entry.reference ? <span className="font-medium text-foreground">#{entry.reference}</span> : "No invoice no."}
            {showDate ? ` · ${day(entry.at)}` : ""}{clock !== null ? `${showDate ? ", " : " · "}${time(clock)}` : ""}{entry.by ? ` · ${entry.by}` : ""}{" · "}{qtyTotal} {qtyTotal === 1 ? "item" : "items"}
          </span>
        </span>
        <span className="hidden w-40 shrink-0 truncate text-right text-xs text-muted-foreground md:block">{isReturn ? (against ? `Against ${against}` : "") : paidBy}</span>
        <span className={cn("w-24 shrink-0 text-right font-bold tabular-nums sm:w-28", isReturn && "text-destructive", rejected && "line-through")}>{isReturn ? "−" : ""}{formatINR(Math.abs(amount))}</span>
      </button>

      {open ? <div className="pb-3 pl-3 pr-3 sm:pl-14 sm:pr-4">
      {isReturn && against ? <p className="pb-2 text-xs text-muted-foreground">Against purchase {against}</p> : null}
      {!isReturn ? (
        <div className="flex flex-wrap items-center gap-1.5 pb-3">
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

      <ul className="rounded-xl border border-border bg-card px-3">
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

      {children ? <div className="pt-1">{children}</div> : null}
      {actions ? <footer className="flex flex-wrap items-center justify-end gap-2 pt-3">{actions}</footer> : null}
      </div> : null}
    </article>
  );
}

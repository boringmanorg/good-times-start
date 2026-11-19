import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Pencil, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Segmented } from "./Segmented";
import { formatINR } from "@/lib/billing";
import { formatQty } from "@/lib/stock-logic";
import { itemInsight, itemPurchaseLines, itemTotals } from "@/lib/purchase-logic";
import type { Material, StockEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type Sort = "spend" | "recent" | "name";
const shortDate = (at: number) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(new Date(at).getFullYear() === new Date().getFullYear() ? {} : { year: "2-digit" as const }) });
const dateText = (at: number) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Every purchase item with its latest price (and change), average price, quantity, bills and amount; opens to its purchase lines. */
export function PurchaseItemsList({ items, entries, suppliers, onEdit }: {
  items: Material[]; entries: StockEntry[]; suppliers: { id: string; name: string }[]; onEdit?: ((m: Material) => void) | undefined;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("spend");
  const [open, setOpen] = useState<string | null>(null);
  const rows = items
    .filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    .map((m) => { const lines = itemPurchaseLines(m.id, entries, suppliers); return { m, lines, totals: itemTotals(lines), insight: itemInsight(lines) }; })
    .sort((a, b) => sort === "name" ? a.m.name.localeCompare(b.m.name)
      : sort === "recent" ? (b.insight.lastAt ?? 0) - (a.insight.lastAt ?? 0) || a.m.name.localeCompare(b.m.name)
      : b.totals.amount - a.totals.amount || a.m.name.localeCompare(b.m.name));

  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Find purchase item" placeholder="Find item" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm" />
      </label>
      <Segmented ariaLabel="Sort items" value={sort} onChange={setSort} options={[{ value: "spend", label: "Most spent" }, { value: "recent", label: "Recent" }, { value: "name", label: "A–Z" }]} />
    </div>
    <p className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "item" : "items"} · approved purchases, returns subtracted</p>

    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map(({ m, lines, totals, insight }) => {
        const isOpen = open === m.id;
        return <li key={m.id} className={isOpen ? "bg-secondary/40" : undefined}>
          <div className="flex items-start gap-2 p-3 sm:items-center">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)} className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 text-left sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <ChevronRight className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform sm:mt-0", isOpen && "rotate-90")} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{m.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{insight.lastAt ? `Last ${dateText(insight.lastAt)} · ${insight.lastSupplier}` : "Not bought yet"}</span>
              </span>
              <span className="col-start-2 row-start-2 min-w-0 text-xs sm:col-start-auto sm:row-start-auto sm:text-sm">
                {insight.lastPrice !== undefined ? <>
                  <span className="tabular-nums">{formatINR(insight.lastPrice)}/{m.unit}</span>
                  <Change pct={insight.changePct} />
                  {insight.averagePrice !== undefined && insight.previousPrice !== undefined ? <span className="block text-xs text-muted-foreground">avg {formatINR(insight.averagePrice)}</span> : null}
                </> : <span className="text-muted-foreground">Standard {formatINR(m.costPerUnit ?? 0)}/{m.unit}</span>}
              </span>
              <span className="col-start-2 row-start-3 text-xs text-muted-foreground sm:col-start-auto sm:row-start-auto sm:text-right sm:text-sm sm:text-foreground">
                {totals.bills ? <>{formatQty(totals.qty, m.unit)}<span className="ml-1 text-xs text-muted-foreground sm:block sm:ml-0">{totals.bills} {totals.bills === 1 ? "bill" : "bills"}</span></> : "—"}
              </span>
              <span className="col-start-3 row-start-1 text-right font-semibold tabular-nums sm:col-start-auto sm:row-start-auto">{totals.bills ? formatINR(totals.amount, 0) : "—"}</span>
            </button>
            {onEdit ? <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => onEdit(m)}><Pencil /></Button> : null}
          </div>
          {isOpen ? <div className="px-3 pb-3">
            {lines.length ? <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="px-2 py-1.5 text-left font-medium">Date</th><th className="hidden px-2 py-1.5 text-left font-medium sm:table-cell">Vendor</th><th className="hidden px-2 py-1.5 text-left font-medium sm:table-cell">Invoice</th><th className="px-2 py-1.5 text-right font-medium">Qty</th><th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Price</th><th className="px-2 py-1.5 text-right font-medium">Amount</th></tr></thead>
              <tbody>{lines.map((l, i) => <tr key={`${l.entryId}-${i}`} className="border-t border-border/60">
                <td className="px-2 py-1.5"><span className="whitespace-nowrap">{shortDate(l.at)}</span>{l.kind === "return" ? <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">Return</span> : null}<span className="block text-[11px] text-muted-foreground sm:hidden">{l.supplier}</span></td>
                <td className="hidden px-2 py-1.5 sm:table-cell">{l.supplier}</td><td className="hidden px-2 py-1.5 sm:table-cell">{l.invoice || "—"}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatQty(l.qty, m.unit)}<span className="block text-[11px] text-muted-foreground sm:hidden">@ {formatINR(l.unitCost)}</span></td><td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell">{formatINR(l.unitCost)}</td>
                <td className={cn("whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums", l.kind === "return" && "text-destructive")}>{formatINR(l.amount)}</td></tr>)}</tbody>
            </table></div> : <p className="py-2 text-xs text-muted-foreground">No purchases of {m.name} yet.</p>}
          </div> : null}
        </li>;
      })}
      {!rows.length ? <li className="py-8 text-center text-sm text-muted-foreground">No items found</li> : null}
    </ul>
  </div>;
}

function Change({ pct }: { pct: number | undefined }) {
  if (pct === undefined || pct === 0) return null;
  return <span title="Change from the previous purchase price" className={cn("ml-1.5 inline-flex items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums", pct > 0 ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success")}>
    {pct > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(pct)}%
  </span>;
}

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { saveRates } from "@/lib/pms/actions";
import { shortDay } from "@/lib/pms/dates";
import { rateSuggestions } from "@/lib/pms/smart";
import type { IsoDate, Stay, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

/** Rate suggestions from the property's own bookings. Nothing changes until someone taps Apply. */
export function SmartRates({ types, units, stays, today, canApply }: { types: UnitType[]; units: Unit[]; stays: Stay[]; today: IsoDate; canApply: boolean }) {
  const all = useMemo(() => rateSuggestions(types, units, stays, today, 30), [types, units, stays, today]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = showAll ? all : all.slice(0, 6);
  const apply = async (items: typeof all) => {
    setBusy(true);
    try {
      for (const s of items) await saveRates(s.typeId, s.night, s.night, { rate: s.suggested });
      toast.success(items.length === 1 ? "Rate applied" : `${items.length} rates applied`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="smart-rates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="smart-rates" className="flex items-center gap-2 text-2xl"><Sparkles className="size-5 text-primary" />Suggested rates</h2>
          <p className="text-sm text-muted-foreground">From how full each night already is, how close it is, and weekends. Next 30 nights.</p>
        </div>
        {canApply && all.length > 1 ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void apply(all)}>Apply all {all.length}</Button> : null}
      </div>
      {all.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Your rates look right for the bookings you have. Suggestions appear as nights fill up or stay empty close in.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {list.map((s) => {
            const up = s.suggested > s.current;
            return (
              <li key={`${s.typeId}-${s.night}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">{shortDay(s.night)} · {s.typeName}</p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums"><span className="text-muted-foreground line-through">{formatINR(s.current, 0)}</span>{" "}
                    <span className={cn("font-bold", up ? "text-success" : "text-warning")}>{formatINR(s.suggested, 0)}</span></span>
                  {canApply ? <Button size="sm" disabled={busy} onClick={() => void apply([s])}>Apply</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {all.length > 6 ? <button type="button" className="mt-2 text-sm font-semibold text-primary" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show all ${all.length}`}</button> : null}
      {!canApply && all.length ? <p className="mt-2 text-xs text-muted-foreground">The owner or manager applies rate changes.</p> : null}
    </section>
  );
}

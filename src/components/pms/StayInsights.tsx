import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { stayInsights, type InsightTone } from "@/lib/pms/smart";
import type { IsoDate, Stay, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

const TONE: Record<InsightTone, string> = { good: "border-l-success", watch: "border-l-warning", act: "border-l-primary" };

/** Plain-language nudges on Home, worked out from this property's own bookings. */
export function StayInsights({ types, units, stays, today }: { types: UnitType[]; units: Unit[]; stays: Stay[]; today: IsoDate }) {
  const list = useMemo(() => stayInsights(types, units, stays, today), [types, units, stays, today]);
  if (!list.length) return null;
  return (
    <section aria-labelledby="insights" className="space-y-2">
      <h2 id="insights" className="flex items-center gap-2 text-2xl"><Sparkles className="size-5 text-primary" />Worth a look</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((i) => (
          <article key={i.id} className={cn("rounded-xl border border-border border-l-4 bg-card p-3.5", TONE[i.tone])}>
            <p className="font-semibold">{i.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{i.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

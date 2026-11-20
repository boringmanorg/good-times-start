import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, BadgeIndianRupee, Building2, Layers, LifeBuoy, MonitorSmartphone, Truck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadActivity, loadPlans, savePlan, type PlanRow } from "@/lib/console-api";
import { activityDay, actorText, AREAS, catalogueDrift, describeActivity, type ActivityArea, type ActivityLine } from "@/lib/activity-logic";
import { FEATURES, FEATURE_NAMES, PUBLIC_PLANS, type Feature } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Failed, Loading } from "./ConsoleBits";

/**
 * Console activity: every confirmed action in one plain-language list, grouped by day, newest
 * first. Whole platform (Activity tab) or one outlet (its Activity section). Saves that changed
 * nothing never show; filters narrow by area.
 */
const ICON: Record<ActivityArea, typeof Layers> = { plans: Layers, billing: BadgeIndianRupee, outlet: Building2, users: Users, devices: MonitorSmartphone, integrations: Truck };
const TONE: Record<ActivityLine["tone"], string> = {
  normal: "bg-secondary text-foreground", money: "bg-success/15 text-success", warn: "bg-gold/15 text-warning", support: "bg-primary/15 text-primary",
};

export function ConsoleActivity({ restaurantId = null, compact = false }: { restaurantId?: string | null; compact?: boolean }) {
  const [area, setArea] = useState<ActivityArea | "all">("all");
  const plans = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  const planNames = useMemo(() => Object.fromEntries((plans.data ?? []).map((p) => [p.id, p.name])), [plans.data]);
  const log = useInfiniteQuery({
    queryKey: ["console", "activity", restaurantId],
    queryFn: ({ pageParam }) => loadActivity(restaurantId, pageParam ?? null),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]?.id ?? null : null),
    refetchInterval: 60_000,
  });
  const rows = useMemo(() => (log.data?.pages.flat() ?? [])
    .map((e) => ({ e, line: describeActivity(e, planNames) }))
    .filter((r): r is { e: typeof r.e; line: ActivityLine } => r.line !== null && (area === "all" || r.line.area === area)), [log.data, planNames, area]);
  const shown = compact ? rows.slice(0, 8) : rows;
  const groups = useMemo(() => {
    const out: { day: string; items: typeof shown }[] = [];
    for (const r of shown) {
      const d = activityDay(r.e.at);
      const last = out[out.length - 1];
      if (last && last.day === d) last.items.push(r); else out.push({ day: d, items: [r] });
    }
    return out;
  }, [shown]);

  if (log.isLoading) return <Loading what="activity" />;
  if (log.error) return <Failed error={log.error} />;
  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {AREAS.filter((a) => !restaurantId || a.v !== "plans").map((a) => (
            <button key={a.v} type="button" onClick={() => setArea(a.v)} aria-pressed={area === a.v}
              className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", area === a.v ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70")}>{a.l}</button>
          ))}
        </div>
      ) : null}
      {groups.map((g) => (
        <section key={g.day}>
          {!compact ? <h3 className="sticky top-0 z-[1] bg-background/95 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.day}</h3> : null}
          <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {g.items.map(({ e, line }) => {
              const Icon = line.tone === "support" ? LifeBuoy : ICON[line.area];
              return (
                <li key={e.id} className="flex gap-3 px-4 py-3">
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", TONE[line.tone])}><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold [overflow-wrap:anywhere]">{line.title}</p>
                    {line.details.length ? <ul className="mt-0.5 space-y-0.5 text-sm text-muted-foreground">{line.details.map((d) => <li key={d} className="[overflow-wrap:anywhere]">{d}</li>)}</ul> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(e.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                      {compact ? ` · ${activityDay(e.at)}` : ""}{!restaurantId && e.outlet && line.area !== "plans" ? ` · ${e.outlet}` : ""} · {actorText(e.actor)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {!shown.length ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing recorded{area !== "all" ? " here" : ""} yet.</p> : null}
      {!compact && log.hasNextPage ? <Button variant="outline" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>{log.isFetchingNextPage ? "Loading…" : "Show older"}</Button> : null}
    </div>
  );
}

const LADDER: Record<string, string[]> = Object.fromEntries(PUBLIC_PLANS.map((p) => [p.id, p.features as string[]]));

/**
 * Warns when the plan catalogue in the cloud no longer matches the plan ladder (plans.ts), and
 * offers to put it back. It drifted twice unnoticed; now it can't.
 */
export function CatalogueDriftBanner() {
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  const [busy, setBusy] = useState(false);
  const drift = catalogueDrift((plans.data ?? []).filter((p) => p.active), LADDER, FEATURES);
  if (!drift.length) return null;
  const restore = async () => {
    if (!window.confirm(`Put ${drift.length} feature switch${drift.length === 1 ? "" : "es"} back to the plan ladder? Every outlet on those plans changes at once.`)) return;
    setBusy(true);
    try {
      for (const id of [...new Set(drift.map((d) => d.plan))]) {
        const p = (plans.data ?? []).find((x) => x.id === id) as PlanRow;
        const features = { ...p.features } as Partial<Record<Feature, boolean>>;
        for (const d of drift.filter((x) => x.plan === id)) features[d.feature as Feature] = d.expected;
        await savePlan({ id: p.id, name: p.name, monthly: p.monthly_price, billdesk: p.billdesk_seats, waiter: p.waiter_seats, admin: p.admin_seats, features, active: p.active, quote: p.quote, tagline: p.tagline });
      }
      toast.success("Plans match the ladder again. The change is in the activity log.");
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't restore the plans"); }
    finally { setBusy(false); }
  };
  return (
    <div role="alert" className="rounded-2xl border border-gold/60 bg-gold/10 p-4">
      <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="size-4" />The plan catalogue differs from the plan ladder</p>
      <ul className="mt-2 space-y-0.5 text-sm">
        {drift.map((d) => <li key={`${d.plan}-${d.feature}`}><strong>{d.name}</strong>: {FEATURE_NAMES[d.feature as Feature] ?? d.feature} is {d.actual ? "on" : "off"}, the ladder says {d.expected ? "on" : "off"}</li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">If this was on purpose, update the ladder in the code (plans.ts) so the website and checks agree. Otherwise put it back.</p>
      <Button size="sm" className="mt-3" disabled={busy} onClick={() => void restore()}>{busy ? "Restoring…" : "Put it back to the ladder"}</Button>
    </div>
  );
}

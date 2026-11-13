import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadPlans, savePlan, type PlanRow } from "@/lib/console-api";
import { FEATURES, FEATURE_NAMES, type Feature } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Failed, Loading, Panel, field } from "./ConsoleBits";

export function ConsolePlans() {
  const q = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  if (q.isLoading) return <Loading what="plans" />;
  if (q.error || !q.data) return <Failed error={q.error} />;
  const live = q.data.filter((p) => p.active);
  const old = q.data.filter((p) => !p.active);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Plans</h1>
        <p className="text-sm text-muted-foreground">Prices, device seats and features for each plan. Changes apply to every restaurant on that plan at once. The website shows its own copy of the price list.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">{live.map((p) => <PlanEditor key={p.id} p={p} />)}</div>
      {old.length ? <p className="text-xs text-muted-foreground">Retired plans kept for history: {old.map((p) => p.name).join(", ")}.</p> : null}
    </div>
  );
}

function PlanEditor({ p }: { p: PlanRow }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.monthly_price));
  const [quote, setQuote] = useState(p.quote);
  const [tagline, setTagline] = useState(p.tagline);
  const [seats, setSeats] = useState({ pos: p.billdesk_seats === null ? "" : String(p.billdesk_seats), waiter: p.waiter_seats === null ? "" : String(p.waiter_seats), manager: p.admin_seats === null ? "" : String(p.admin_seats) });
  const [features, setFeatures] = useState<Partial<Record<Feature, boolean>>>(p.features);
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s === "" ? null : Number(s));
  const save = async () => {
    setBusy(true);
    try {
      await savePlan({ id: p.id, name: name.trim() || p.name, monthly: Number(price) || 0, billdesk: num(seats.pos), waiter: num(seats.waiter), admin: num(seats.manager), features, active: true, quote, tagline });
      toast.success(`${name} saved`);
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the plan"); }
    finally { setBusy(false); }
  };
  return (
    <Panel title={`${p.name} · ${p.id}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Name<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
        <label className="text-sm font-medium">Price per month (₹)<input inputMode="numeric" value={price} disabled={quote} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 6))} className={field} /></label>
        <label className="text-sm font-medium sm:col-span-2">Tagline<input value={tagline} maxLength={120} onChange={(e) => setTagline(e.target.value)} className={field} /></label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />Call for quote</label>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([["pos", "Billdesk"], ["waiter", "Waiter"], ["manager", "Admin / Manager"]] as const).map(([k, l]) => (
          <label key={k} className="text-xs text-muted-foreground">{l} seats<input inputMode="numeric" placeholder="any" value={seats[k]} onChange={(e) => setSeats((s) => ({ ...s, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className={field} /></label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {FEATURES.map((f) => (
          <button key={f} type="button" aria-pressed={!!features[f]} onClick={() => setFeatures((c) => ({ ...c, [f]: !c[f] }))}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", features[f] ? "bg-primary text-primary-foreground ring-primary" : "text-muted-foreground ring-border hover:text-foreground")}>{FEATURE_NAMES[f]}</button>
        ))}
      </div>
      <Button className="mt-4" disabled={busy} onClick={() => void save()}><Save />{busy ? "Saving…" : "Save plan"}</Button>
    </Panel>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, CopyPlus, IndianRupee, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { supabase } from "@/integrations/supabase/client";
import { createOutlet, outletSales, pushMenu } from "@/lib/outlet-actions";
import { brandTotals, newOutletProblem, outletCountText, pushMenuProblem, ranked, shareOfBrand, totalsByOutlet, type Outlet } from "@/lib/brand-logic";
import { useEntitlements } from "@/lib/use-entitlements";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/brand")({
  head: () => ({ meta: [{ title: "Brand — XTSY POS" }, { name: "description", content: "Every outlet under one brand: sales together, add an outlet, push the menu." }, { name: "robots", content: "noindex" }] }),
  component: BrandPage,
});

const field = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";

/** Which outlets this brand has, and the account they sit under. */
function useBrand() {
  const { user } = useStaff();
  return useQuery({
    queryKey: ["brand", user?.restaurantId],
    enabled: !!user?.restaurantId,
    queryFn: async () => {
      const { data: mine } = await supabase.from("restaurants").select("account_id").eq("id", user!.restaurantId!).maybeSingle();
      const accountId = (mine as { account_id: string | null } | null)?.account_id ?? null;
      if (!accountId) return { accountId: null, outlets: [] as Outlet[], maxOutlets: null as number | null };
      const [{ data: rows }, { data: acc }] = await Promise.all([
        supabase.from("restaurants").select("id, name, city, slug").eq("account_id", accountId).order("created_at"),
        supabase.from("accounts").select("plan_id, plans(max_outlets)").eq("id", accountId).maybeSingle(),
      ]);
      const plan = (acc as { plans: { max_outlets: number | null } | null } | null)?.plans ?? null;
      return { accountId, outlets: (rows ?? []) as Outlet[], maxOutlets: plan?.max_outlets ?? null };
    },
  });
}

function BrandPage() {
  const { user } = useStaff();
  const plan = useEntitlements();
  const brand = useBrand();
  const queryClient = useQueryClient();
  const outlets = useMemo(() => brand.data?.outlets ?? [], [brand.data]);
  const ids = useMemo(() => outlets.map((o) => o.id), [outlets]);

  const [days, setDays] = useState(7);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, [days]);

  const sales = useQuery({
    queryKey: ["brand-sales", ids, days],
    enabled: ids.length > 0,
    queryFn: () => outletSales(ids, range.from, range.to),
  });

  const rows = totalsByOutlet(outlets, sales.data ?? []);
  const total = brandTotals(rows);
  const byName = (id: string) => outlets.find((o) => o.id === id);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4">
        <header>
          <h1 className="flex items-center gap-2 font-brand text-3xl"><Building2 className="size-7 text-primary" />Brand</h1>
          <p className="text-sm text-muted-foreground">
            {brand.isLoading ? "Loading your outlets…" : `${outletCountText(outlets.length)} under one brand. Sales below are every outlet together.`}
          </p>
        </header>

        {brand.data && !brand.data.accountId ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            This outlet isn't linked to a brand account yet. Ask XTSY to connect it.
          </p>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Sales together</h2>
            <div className="flex gap-1 rounded-full bg-secondary p-1">
              {[7, 30, 90].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold", days === d ? "bg-raised text-foreground" : "text-muted-foreground")}>
                  {d} days
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Brand sales" value={sales.isLoading ? "…" : formatINR(total.net)} icon={IndianRupee} />
            <Stat label="Bills" value={sales.isLoading ? "…" : String(total.bills)} icon={Store} />
            <Stat label="Average bill" value={sales.isLoading ? "…" : formatINR(total.average)} icon={IndianRupee} />
          </div>

          {sales.error ? <p className="mt-3 text-sm text-destructive">Couldn't load brand sales. Check the connection and try again.</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2">Outlet</th><th className="p-2 text-right">Bills</th>
                <th className="p-2 text-right">Sales</th><th className="hidden p-2 text-right sm:table-cell">Average</th>
                <th className="p-2 text-right">Share</th>
              </tr></thead>
              <tbody>
                {ranked(rows).map((r) => {
                  const o = byName(r.id);
                  const mine = r.id === user?.restaurantId;
                  return (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="p-2 font-medium">{o?.name ?? "Outlet"}{mine ? <span className="ml-2 text-xs font-semibold text-primary">You</span> : null}
                        {o?.city ? <span className="block text-xs text-muted-foreground">{o.city}</span> : null}</td>
                      <td className="p-2 text-right tabular-nums">{r.bills}</td>
                      <td className="p-2 text-right tabular-nums">{formatINR(r.net)}</td>
                      <td className="hidden p-2 text-right tabular-nums sm:table-cell">{r.bills ? formatINR(r.average) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{Math.round(shareOfBrand(r, total.net) * 100)}%</td>
                    </tr>
                  );
                })}
                {!rows.length && !brand.isLoading ? <tr><td colSpan={5} className="p-3 text-sm text-muted-foreground">No outlets yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <AddOutlet accountId={brand.data?.accountId ?? null} outlets={outlets} maxOutlets={brand.data?.maxOutlets ?? null}
          onAdded={() => void queryClient.invalidateQueries({ queryKey: ["brand"] })} />

        <PushMenu outlets={outlets} mine={user?.restaurantId ?? null} />

        {plan && !plan.features["multi_outlet"] ? (
          <p className="text-xs text-muted-foreground">Several outlets under one brand come with the Enterprise / Brand plan.</p>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Store }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

/** Add another outlet to the brand, optionally starting from an existing outlet's menu and settings. */
function AddOutlet({ accountId, outlets, maxOutlets, onAdded }: {
  accountId: string | null; outlets: Outlet[]; maxOutlets: number | null; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const problem = newOutletProblem(name, outlets.length, maxOutlets);

  const add = useMutation({
    mutationFn: () => createOutlet(accountId!, name.trim(), city.trim(), copyFrom || null),
    onSuccess: () => {
      toast.success(`${name.trim()} added to the brand`);
      setName(""); setCity(""); setCopyFrom(""); setOpen(false);
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!accountId) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Outlets</h2>
          <p className="text-xs text-muted-foreground">
            {outletCountText(outlets.length)}{maxOutlets !== null ? ` of ${maxOutlets} this plan covers` : ""}.
          </p>
        </div>
        {!open ? <Button variant="outline" onClick={() => setOpen(true)}><Plus />Add an outlet</Button> : null}
      </div>

      {open ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Outlet name
            <input value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder="TAB Express" className={field} />
          </label>
          <label className="text-sm font-medium">City
            <input value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className={field} />
          </label>
          <label className="text-sm font-medium">Start from
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={field}>
              <option value="">Empty outlet</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>Copy {o.name}'s menu and settings</option>)}
            </select>
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
            <Button disabled={!!problem || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? "Adding…" : "Add outlet"}
            </Button>
            <Button variant="ghost" disabled={add.isPending} onClick={() => { setOpen(false); setName(""); }}>Cancel</Button>
            {problem && name ? <span className="text-xs text-warning">{problem}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Copy one outlet's menu over the others, so the brand reads the same everywhere. */
function PushMenu({ outlets, mine }: { outlets: Outlet[]; mine: string | null }) {
  const [from, setFrom] = useState<string | null>(mine);
  const [to, setTo] = useState<string[]>([]);
  const source = from ?? mine;
  const problem = pushMenuProblem(source, to);

  const push = useMutation({
    mutationFn: () => pushMenu(source!, to.filter((id) => id !== source)),
    onSuccess: (n) => { toast.success(`${n} dish${n === 1 ? "" : "es"} copied across`); setTo([]); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (outlets.length < 2) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold"><CopyPlus className="size-4 text-primary" />Push the menu across the brand</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Copies the chosen outlet's dishes and prices over the outlets you tick. Their own bills and sales are untouched.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Copy from
          <select value={source ?? ""} onChange={(e) => setFrom(e.target.value)} className={field}>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <fieldset className="text-sm font-medium">Copy to
          <div className="mt-1 space-y-1">
            {outlets.filter((o) => o.id !== source).map((o) => (
              <label key={o.id} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-normal">
                <input type="checkbox" checked={to.includes(o.id)}
                  onChange={(e) => setTo((v) => (e.target.checked ? [...v, o.id] : v.filter((x) => x !== o.id)))} />
                {o.name}{to.includes(o.id) ? <Check className="ml-auto size-4 text-success" /> : null}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={!!problem || push.isPending} onClick={() => push.mutate()}>
          {push.isPending ? "Copying…" : "Copy the menu across"}
        </Button>
        {problem ? <span className="text-xs text-muted-foreground">{problem}</span> : null}
      </div>
    </section>
  );
}

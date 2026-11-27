import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, CopyPlus, IndianRupee, Package, Plus, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "@/lib/supabase-app";
import { getDb } from "@/lib/db";
import { createOutlet, outletPurchases, outletSales, pushMenu, transferStock } from "@/lib/outlet-actions";
import { brandPnl, brandTotals, newOutletProblem, outletCountText, pnlByOutlet, pushMenuProblem, ranked, shareOfBrand, totalsByOutlet, transferLines, transferProblem, type Outlet } from "@/lib/brand-logic";
import { useEntitlements } from "@/lib/use-entitlements";
import { isAdmin, useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { GiftCards } from "@/components/brand/GiftCards";
import { featureOn } from "@/lib/plans";
import { SILENT_PARAMS } from "@/lib/silent-route";

export const Route = createFileRoute("/brand/{-$sub}")({
  params: SILENT_PARAMS,
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

  // Purchase cost sits beside sales. An older cloud has no outlet_purchases yet, so a failure
  // here must not take the sales table down with it: treat it as "no cost figures".
  const spend = useQuery({
    queryKey: ["brand-spend", ids, days],
    enabled: ids.length > 0,
    retry: false,
    queryFn: () => outletPurchases(ids, range.from, range.to),
  });

  const rows = totalsByOutlet(outlets, sales.data ?? []);
  const total = brandTotals(rows);
  const pnl = pnlByOutlet(outlets, sales.data ?? [], spend.data ?? []);
  const brandLine = brandPnl(pnl);
  const costKnown = !spend.error && (spend.data?.length ?? 0) > 0;
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

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Sales less purchases</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            What the brand sold, less what it spent on approved purchases (supplier returns taken off).
            Rent, wages and the rest aren't in the POS, so this is a trading margin, not profit.
          </p>
          {!costKnown ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {spend.isLoading ? "Loading purchase cost…" : "No approved purchases recorded in these days."}
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Stat label="Sales" value={formatINR(brandLine.sales)} icon={IndianRupee} />
                <Stat label="Purchases" value={formatINR(brandLine.spend)} icon={Package} />
                <Stat label={brandLine.gross < 0 ? "Short by" : "Left over"} value={formatINR(Math.abs(brandLine.gross))} icon={IndianRupee} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-2">Outlet</th><th className="p-2 text-right">Sales</th>
                    <th className="p-2 text-right">Purchases</th><th className="p-2 text-right">Left</th>
                    <th className="hidden p-2 text-right sm:table-cell">Margin</th>
                  </tr></thead>
                  <tbody>
                    {pnl.map((r) => (
                      <tr key={r.id} className="border-b border-border/60">
                        <td className="p-2 font-medium">{byName(r.id)?.name ?? "Outlet"}</td>
                        <td className="p-2 text-right tabular-nums">{formatINR(r.sales)}</td>
                        <td className="p-2 text-right tabular-nums">{formatINR(r.spend)}</td>
                        <td className={cn("p-2 text-right font-semibold tabular-nums", r.gross < 0 && "text-destructive")}>{formatINR(r.gross)}</td>
                        <td className="hidden p-2 text-right tabular-nums sm:table-cell">{r.sales ? `${Math.round(r.margin * 100)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <AddOutlet accountId={brand.data?.accountId ?? null} outlets={outlets} maxOutlets={brand.data?.maxOutlets ?? null}
          onAdded={() => void queryClient.invalidateQueries({ queryKey: ["brand"] })} />

        <SendStock outlets={outlets} mine={user?.restaurantId ?? null} />

        <PushMenu outlets={outlets} mine={user?.restaurantId ?? null} />

        <GiftCards accountId={brand.data?.accountId ?? null} outlets={outlets} mine={user?.restaurantId ?? null} admin={isAdmin(user)} enabled={featureOn(plan, "gift_cards")} />

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

/**
 * Send stock from the outlet this device is in to another outlet of the same brand.
 *
 * The sender is always the current outlet: a device holds one outlet's items, so those are the
 * only ones it can weigh out and send. The cloud writes both sides of the transfer together.
 */
function SendStock({ outlets, mine }: { outlets: Outlet[]; mine: string | null }) {
  const materials = useLiveQuery(async () => (await getDb().materials.toArray()).filter((m) => !m.archived).sort((a, b) => a.name.localeCompare(b.name)), [], []);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ materialId: string; qty: number }[]>([{ materialId: "", qty: 0 }]);
  const here = outlets.find((o) => o.id === mine);
  const problem = transferProblem(to, lines);

  const send = useMutation({
    mutationFn: () => transferStock(mine!, to!, transferLines(lines).map((l) => {
      const m = materials.find((x) => x.id === l.materialId);
      return { materialId: l.materialId, qty: l.qty, unitCost: m?.costPerUnit, name: m?.name, unit: m?.unit };
    }), note.trim()),
    onSuccess: () => {
      toast.success(`Sent to ${outlets.find((o) => o.id === to)?.name ?? "the outlet"}`);
      setLines([{ materialId: "", qty: 0 }]); setNote(""); setTo(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (outlets.length < 2 || !mine) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Truck className="size-4 text-primary" />Send stock to another outlet</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Moves items out of {here?.name ?? "this outlet"} and into the one you choose, at the price this outlet paid.
        Both outlets see the transfer in their purchase history. It isn't a new purchase, so it doesn't change brand spend.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Send to
          <select value={to ?? ""} onChange={(e) => setTo(e.target.value || null)} className={field}>
            <option value="">Choose an outlet</option>
            {outlets.filter((o) => o.id !== mine).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Note
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Van at 6am" className={field} />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-xs font-medium">Item
              <select value={l.materialId} onChange={(e) => setLines((v) => v.map((x, j) => (j === i ? { ...x, materialId: e.target.value } : x)))} className={field}>
                <option value="">Choose an item</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
              </select>
            </label>
            <label className="w-28 text-xs font-medium">Quantity
              <input inputMode="decimal" value={l.qty || ""} onChange={(e) => setLines((v) => v.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 } : x)))} className={field} />
            </label>
            {lines.length > 1 ? (
              <Button variant="ghost" className="text-destructive" onClick={() => setLines((v) => v.filter((_, j) => j !== i))}>Remove</Button>
            ) : null}
          </div>
        ))}
        <Button variant="outline" onClick={() => setLines((v) => [...v, { materialId: "", qty: 0 }])}><Plus />Add another item</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={!!problem || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? "Sending…" : "Send the stock"}
        </Button>
        {problem ? <span className="text-xs text-muted-foreground">{problem}</span> : null}
      </div>
    </section>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadPlans, savePlan, type PlanRow } from "@/lib/console-api";
import { featureName, featuresFor, isStayPlan, STARTER_FEATURES, type Feature } from "@/lib/plans";
import { newPlanId, planProduct, productById, PRODUCTS, type ProductId } from "@/lib/products";
import { seatAppsFor } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Failed, Loading, Panel, field } from "./ConsoleBits";
import { CatalogueDriftBanner } from "./ConsoleActivity";

export function ConsolePlans() {
  const q = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  const [model, setModel] = useState<ProductId>("restaurant_pos");
  if (q.isLoading) return <Loading what="plans" />;
  if (q.error || !q.data) return <Failed error={q.error} />;
  const live = q.data.filter((p) => p.active);
  const old = q.data.filter((p) => !p.active);
  const mine = live.filter((p) => planProduct(p.id) === model);
  const info = productById(model);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Plans</h1>
        <p className="text-sm text-muted-foreground">One console, a price list per POS model. Prices, device seats and features apply to every outlet on that plan at once, show on that model's page on the website straight away, and are recorded in Activity.</p>
      </div>
      <CatalogueDriftBanner />
      <nav className="no-scrollbar flex gap-1.5 overflow-x-auto" aria-label="POS model">
        {PRODUCTS.map((m) => {
          const n = live.filter((p) => planProduct(p.id) === m.id).length;
          return (
            <button key={m.id} type="button" onClick={() => setModel(m.id)} aria-pressed={model === m.id}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold ring-1", model === m.id ? "bg-primary text-primary-foreground ring-primary" : "ring-border hover:bg-secondary")}>
              {m.name} <span className="font-normal opacity-75">· {n}</span>
            </button>
          );
        })}
      </nav>
      <p className="text-sm text-muted-foreground">{info.name}: {info.status === "live" ? "live" : info.status === "pilot" ? "in pilot" : "coming soon"}. {mine.length ? `${mine.length} plan${mine.length === 1 ? "" : "s"}.` : "No plans yet: its website page shows \"Prices on request\" until you add one."}</p>
      <div className="grid gap-5 xl:grid-cols-2">{mine.map((p) => <PlanEditor key={p.id} p={p} />)}</div>
      <AddPlan key={model} model={model} taken={q.data.map((p) => p.id)} />
      {old.length ? <p className="text-xs text-muted-foreground">Retired plans kept for history: {old.map((p) => p.name).join(", ")}.</p> : null}
    </div>
  );
}

/** A new plan for one model. Its id carries the model's prefix, which is how the catalogue knows whose it is. */
function AddPlan({ model, taken }: { model: ProductId; taken: string[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quote, setQuote] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = name.trim() ? newPlanId(model, name) : "";
  const kind = model === "restaurant_pos" ? "restaurant" : model === "tourism_pos" ? "tourism" : "stay";
  const problem = !name.trim() ? "" : !/^[a-z0-9_]{2,24}$/.test(id) ? "Use letters and digits in the name." : taken.includes(id) ? "A plan with this name already exists." : (!quote && !price) ? "Enter a price or tick Call for quote." : "";
  const add = async () => {
    setBusy(true);
    try {
      await savePlan({ id, name: name.trim(), monthly: Number(price) || 0, billdesk: null, waiter: model === "restaurant_pos" ? 0 : null, admin: 1, active: true, quote, tagline: "",
        features: Object.fromEntries(STARTER_FEATURES[kind].map((f) => [f, true])) });
      toast.success(`${name.trim()} added to ${productById(model).name}`);
      setName(""); setPrice(""); setQuote(false);
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add the plan"); }
    finally { setBusy(false); }
  };
  return (
    <Panel title={`Add a ${productById(model).name} plan`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <label className="text-sm font-medium">Plan name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Starter" className={field} /></label>
        <label className="text-sm font-medium">Price per month (₹)<input inputMode="numeric" value={price} disabled={quote} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 6))} className={field} /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium"><input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />Call for quote</label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{id ? <>Plan id <span className="font-mono">{id}</span>. </> : null}It starts with the core features; switch the rest on in the plan once added. Seats start at 1 admin, no limit on counters.</p>
      {problem ? <p className="mt-2 text-sm text-destructive">{problem}</p> : null}
      <Button className="mt-3" disabled={busy || !id || !!problem} onClick={() => void add()}><Plus />{busy ? "Adding…" : "Add plan"}</Button>
    </Panel>
  );
}

function PlanEditor({ p }: { p: PlanRow }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.monthly_price));
  const [quote, setQuote] = useState(p.quote);
  const [tagline, setTagline] = useState(p.tagline);
  const [seats, setSeats] = useState({ pos: p.billdesk_seats === null ? "" : String(p.billdesk_seats), waiter: p.waiter_seats === null ? "" : String(p.waiter_seats), manager: p.admin_seats === null ? "" : String(p.admin_seats) });
  // Models without Waiter Pro (stays, tourism) always save 0 waiter seats.
  const hasWaiter = seatAppsFor(planProduct(p.id)).some(([a]) => a === "waiter");
  const [features, setFeatures] = useState<Partial<Record<Feature, boolean>>>(p.features);
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s === "" ? null : Number(s));
  // Stay plans: rooms in the base price, ₹ per extra room, and how many properties one subscription covers.
  const stay = isStayPlan(p.id);
  const [rooms, setRooms] = useState(p.included_rooms == null ? "" : String(p.included_rooms));
  const [extra, setExtra] = useState(p.extra_room_price == null ? "" : String(p.extra_room_price));
  const [props, setProps] = useState(String(p.max_outlets ?? 1));
  const save = async () => {
    setBusy(true);
    try {
      const priceChanged = (Number(price) || 0) !== p.monthly_price || (stay && (num(rooms) !== (p.included_rooms ?? null) || num(extra) !== (p.extra_room_price ?? null)));
      if (priceChanged && !window.confirm(`New clients will see the new ${name} terms. Clients already on ${name} keep the price they have now; change any of them under the client's Plan & billing. Save?`)) return;
      await savePlan({ id: p.id, name: name.trim() || p.name, monthly: Number(price) || 0, billdesk: num(seats.pos), waiter: hasWaiter ? num(seats.waiter) : 0, admin: num(seats.manager), features, active: true, quote, tagline,
        ...(stay ? { rooms: { included: num(rooms), extra: num(rooms) === null ? null : num(extra) }, maxOutlets: Math.max(1, Number(props) || 1) } : {}) });
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
      {stay ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-xs text-muted-foreground">Rooms included<input inputMode="numeric" placeholder="no limit" value={rooms} onChange={(e) => setRooms(e.target.value.replace(/\D/g, "").slice(0, 4))} className={field} /></label>
          <label className="text-xs text-muted-foreground">₹ per extra room a month<input inputMode="numeric" placeholder="—" disabled={rooms === ""} value={extra} onChange={(e) => setExtra(e.target.value.replace(/\D/g, "").slice(0, 6))} className={field} /></label>
          <label className="text-xs text-muted-foreground">Properties covered<input inputMode="numeric" value={props} onChange={(e) => setProps(e.target.value.replace(/\D/g, "").slice(0, 3))} className={field} /></label>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">A new price or room terms apply to new clients. Clients already on this plan keep what they pay now.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {seatAppsFor(planProduct(p.id)).map(([k, l]) => (
          <label key={k} className="text-xs text-muted-foreground">{l} seats<input inputMode="numeric" placeholder="any" value={seats[k]} onChange={(e) => setSeats((s) => ({ ...s, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className={field} /></label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {featuresFor(isStayPlan(p.id)).map((f) => (
          <button key={f} type="button" aria-pressed={!!features[f]} onClick={() => setFeatures((c) => ({ ...c, [f]: !c[f] }))}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", features[f] ? "bg-primary text-primary-foreground ring-primary" : "text-muted-foreground ring-border hover:text-foreground")}>{featureName(f, isStayPlan(p.id))}</button>
        ))}
      </div>
      <Button className="mt-4" disabled={busy} onClick={() => void save()}><Save />{busy ? "Saving…" : "Save plan"}</Button>
    </Panel>
  );
}

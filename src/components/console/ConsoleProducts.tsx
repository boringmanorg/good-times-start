import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BedDouble, Building2, ChevronRight, Hotel, MapPin, Mountain, Plane, Plus, Search, Store, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ago, loadAccountPrices, loadPlans, loadRestaurants, type PlanRow, type RestaurantRow } from "@/lib/console-api";
import { clientTerms } from "@/lib/plans";
import { consoleToken } from "@/lib/console-client";
import { platformRestaurantModels } from "@/lib/platform-restaurants.functions";
import { modelLabel } from "@/lib/platform-restaurant-logic";
import { filterMatches, productById, productOf, PRODUCTS, STAY_PRODUCTS, restaurantMatches, sectionsFor, type ConsoleRoute, type ListFilter, type ProductId, type Section } from "@/lib/products";
import { cn } from "@/lib/utils";
import { Failed, Loading, Stat } from "./ConsoleBits";
import { ConsoleOnboard } from "./ConsoleOnboard";
import { ConsoleChannel } from "./ConsoleChannel";
import { ConsoleSandbox } from "./ConsoleSandbox";
import { ConsoleLogins } from "./ConsoleLogins";
import { ConsoleIntegrations } from "./ConsoleIntegrations";
import { ConsoleActivity } from "./ConsoleActivity";
import { DevicesSection, RestaurantInfo, SeatsSummary, SubscriptionSection } from "./ConsoleRestaurants";

/**
 * Console → Products: every XTSY POS model, then a product's outlets, then one outlet with its
 * sections (Overview, Plan & billing, Users with "Sign in as", Devices, Swiggy & Zomato).
 * Addressed by the hash (products.ts), so every level can be bookmarked and Back works.
 */
const ICONS: Record<ProductId, typeof Store> = { restaurant_pos: UtensilsCrossed, hotel_pos: Hotel, resort_pos: Mountain, hostel_pos: BedDouble, tourism_pos: Plane };

type Go = (r: ConsoleRoute) => void;

function useCatalog() {
  const rows = useQuery({ queryKey: ["console", "restaurants"], queryFn: loadRestaurants, refetchInterval: 60_000 });
  const plans = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  const meta = useQuery({ queryKey: ["console", "models"], queryFn: async () => platformRestaurantModels({ data: { token: await consoleToken() } }) });
  const productFor = (id: string) => productOf(meta.data?.[id]?.product);
  return { rows, plans, meta, productFor };
}

export function ConsoleProducts({ route, go }: { route: ConsoleRoute; go: Go }) {
  const { rows, plans, meta, productFor } = useCatalog();
  if (rows.isLoading || plans.isLoading) return <Loading what="products" />;
  if (rows.error || !rows.data) return <Failed error={rows.error} />;
  const all = rows.data;
  const planList = plans.data ?? [];

  if (route.product && route.restaurant) {
    const r = all.find((x) => x.id === route.restaurant);
    if (!r) return <><Crumbs route={route} go={go} /><Failed error={new Error("That restaurant isn't in the list. It may have been removed.")} /></>;
    return <RestaurantDetail r={r} plans={planList} model={meta.data?.[r.id]?.model ?? ""} route={route} go={go} stays={STAY_PRODUCTS.includes(productFor(r.id))} product={productFor(r.id)} />;
  }
  if (route.product) {
    const product = productById(route.product);
    return <ProductOutlets product={route.product} rows={all.filter((r) => productFor(r.id) === product.id)} plans={planList} models={meta.data ?? {}} route={route} go={go} />;
  }
  return <ProductsHome rows={all} productFor={productFor} go={go} />;
}

function Crumbs({ route, go, name }: { route: ConsoleRoute; go: Go; name?: string }) {
  const items: { label: string; to?: ConsoleRoute }[] = [{ label: "Products", to: { tab: "products" } }];
  if (route.product) items.push({ label: productById(route.product).name, to: { tab: "products", product: route.product } });
  if (route.restaurant) items.push({ label: name ?? "Restaurant" });
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {items.map((it, i) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          {i ? <ChevronRight className="size-3.5" /> : null}
          {it.to && i < items.length - 1 ? <button type="button" onClick={() => go(it.to!)} className="font-medium hover:text-foreground hover:underline">{it.label}</button>
            : <span className="font-semibold text-foreground">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function ProductsHome({ rows, productFor, go }: { rows: RestaurantRow[]; productFor: (id: string) => ProductId; go: Go }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Products</h1>
        <p className="text-sm text-muted-foreground">Each XTSY POS model, its outlets and their users. Open a product, then an outlet, to manage it or sign in as one of its users.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PRODUCTS.map((p) => {
          const Icon = ICONS[p.id];
          const mine = rows.filter((r) => productFor(r.id) === p.id);
          const live = mine.filter((r) => r.account?.live).length;
          const devices = mine.reduce((s, r) => s + r.devices.filter((d) => d.status === "active").length, 0);
          const soon = p.status === "soon";
          return (
            <button key={p.id} type="button" disabled={soon} onClick={() => go({ tab: "products", product: p.id })}
              className={cn("group flex flex-col rounded-2xl border p-5 text-left transition-colors", soon ? "cursor-not-allowed border-dashed border-border bg-card/60" : "border-border bg-card hover:border-primary")}>
              <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-11 place-items-center rounded-xl", soon ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground")}><Icon className="size-5" /></span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", soon ? "bg-secondary text-muted-foreground" : "bg-success/15 text-success")}>{soon ? "Coming soon" : p.status === "pilot" ? "Pilot" : "Live"}</span>
              </div>
              <p className="mt-4 text-lg font-bold">{p.name}</p>
              <p className="text-xs font-medium text-primary">{p.models}</p>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.blurb}</p>
              {soon ? <p className="mt-4 text-xs text-muted-foreground">Onboarding opens when this model launches.</p> : (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <Mini label="Outlets" value={mine.length} /><Mini label="Live" value={live} /><Mini label="Devices" value={devices} />
                </div>
              )}
              {!soon ? <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open {p.name}<ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Mini = ({ label, value }: { label: string; value: ReactNode }) => <div><p className="text-lg font-bold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>;

const FILTERS: { v: ListFilter; l: string }[] = [{ v: "all", l: "All" }, { v: "live", l: "Live" }, { v: "stopped", l: "Stopped" }, { v: "trial", l: "Trial" }, { v: "due", l: "Payment due" }];

function ProductOutlets({ product, rows, plans, models, route, go }: { product: ProductId; rows: RestaurantRow[]; plans: PlanRow[]; models: Record<string, { model: string }>; route: ConsoleRoute; go: Go }) {
  const p = productById(product);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [onboarding, setOnboarding] = useState(false);
  const planName = (id: string | undefined) => plans.find((x) => x.id === id)?.name ?? id ?? "No plan";
  const shown = rows.filter((r) => restaurantMatches({ ...r, planName: planName(r.account?.planId) }, query) && filterMatches({ live: !!r.account?.live, status: r.account?.status ?? null }, filter));
  // Monthly revenue at what each client actually pays (own price or list), once per account: a Group plan covers several properties.
  const prices = useQuery({ queryKey: ["console", "account-prices"], queryFn: loadAccountPrices });
  const billed = new Map<string, number>();
  for (const r of rows) {
    const a = r.account; const plan = plans.find((x) => x.id === a?.planId);
    if (a && plan && a.live && !a.complimentary) billed.set(a.id, clientTerms(plan, prices.data?.[a.id]).price);
  }
  const mrr = [...billed.values()].reduce((s, v) => s + v, 0);
  return (
    <div className="space-y-5">
      <Crumbs route={route} go={go} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-brand text-3xl">{p.name}</h1><p className="text-sm text-muted-foreground">{p.models}</p></div>
        {p.status !== "soon" ? <Button onClick={() => setOnboarding((v) => !v)} variant={onboarding ? "outline" : "default"}>{onboarding ? <><X />Close</> : <><Plus />Onboard an outlet</>}</Button> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outlets" value={rows.length} />
        <Stat label="Live now" value={rows.filter((r) => r.account?.live).length} tone="good" />
        <Stat label="Stopped" value={rows.filter((r) => !r.account?.live).length} tone={rows.some((r) => !r.account?.live) ? "bad" : undefined} />
        <Stat label="Billed monthly" value={`₹${mrr.toLocaleString("en-IN")}`} note="live, not complimentary" />
      </div>
      {onboarding ? <ConsoleOnboard plans={plans} product={product} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1"><span className="sr-only">Search outlets</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, QR address, city or plan" className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => <button key={f.v} type="button" onClick={() => setFilter(f.v)} aria-pressed={filter === f.v}
            className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", filter === f.v ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70")}>{f.l}</button>)}
        </div>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {shown.map((r) => {
          const active = r.devices.filter((d) => d.status === "active").length;
          const waiting = r.devices.filter((d) => d.status === "pending" || d.status === "over_plan").length;
          return (
            <li key={r.id}>
              <button type="button" onClick={() => go({ tab: "products", product, restaurant: r.id, section: "overview" })} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-secondary/60">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary font-bold">{r.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[modelLabel(models[r.id]?.model), r.city, r.slug ? `/${r.slug}` : ""].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{planName(r.account?.planId)}{r.account?.complimentary ? " · comp" : ""}</span>
                <span className="text-xs text-muted-foreground sm:w-28">{active} device{active === 1 ? "" : "s"}{waiting ? <span className="block text-warning">{waiting} waiting</span> : null}</span>
                <span className="hidden w-28 text-xs text-muted-foreground md:block">active {ago(r.lastActivity)}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", r.account?.live ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>{r.account?.live ? "Live" : "Stopped"}</span>
                <ChevronRight className="ml-auto size-4 text-muted-foreground sm:ml-0" />
              </button>
            </li>
          );
        })}
        {!shown.length ? <li className="p-6 text-center text-sm text-muted-foreground">{rows.length ? "No outlet matches." : "No outlets on this product yet."}</li> : null}
      </ul>
    </div>
  );
}

function RestaurantDetail({ r, plans, model, route, go, stays, product }: { r: RestaurantRow; plans: PlanRow[]; model: string; route: ConsoleRoute; go: Go; stays: boolean; product: ProductId }) {
  const section: Section = route.section ?? "overview";
  const plan = plans.find((p) => p.id === r.account?.planId);
  const pick = (s: Section) => go({ ...route, section: s });
  return (
    <div>
      <Crumbs route={route} go={go} name={r.name} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">{r.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="font-brand truncate text-3xl leading-tight">{r.name}</h1>
            <p className="text-xs text-muted-foreground">{modelLabel(model) ? `${modelLabel(model)} · ` : ""}{r.city ? <><MapPin className="mr-0.5 inline size-3" />{r.city} · </> : null}{plan?.name ?? "No plan"} · joined {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-bold", r.account?.live ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>{r.account?.live ? "Live" : "Stopped"}</span>
      </header>
      <nav className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Restaurant">
        {sectionsFor(product).map((s) => (
          <button key={s.v} type="button" onClick={() => pick(s.v)} aria-current={section === s.v ? "page" : undefined}
            className={cn("relative shrink-0 px-3 py-2.5 text-sm font-semibold", section === s.v ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
            {s.l}{section === s.v ? <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t bg-primary" aria-hidden="true" /> : null}
          </button>
        ))}
      </nav>
      <div className="mt-5">
        {section === "overview" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Last activity" value={ago(r.lastActivity)} />
              <Stat label={stays ? "Bookings & bills changed · 30 days" : "Bill changes · 30 days"} value={r.bills30d} />
              <Stat label={stays ? "Café & room QR orders · 7 days" : "QR orders · 7 days"} value={r.guestOrders7d} />
              <Stat label="Paid until" value={r.account?.complimentary ? "Complimentary" : r.account?.paidUntil ? new Date(r.account.paidUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No end"} tone={r.account?.live ? undefined : "bad"} />
            </div>
            <SeatsSummary r={r} product={product} />
            <RestaurantInfo key={r.id} r={r} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => pick("users")}><Building2 />Users and Sign in as</Button>
              {stays ? <Button variant="outline" onClick={() => pick("channel")}>Channel manager</Button> : <Button variant="outline" onClick={() => pick("integrations")}>Swiggy & Zomato sandbox</Button>}
            </div>
          </div>
        ) : null}
        {section === "subscription" ? <SubscriptionSection key={r.id} r={r} plans={plans} product={product} /> : null}
        {section === "users" ? <ConsoleLogins restaurantId={r.id} restaurantName={r.name} stay={stays} /> : null}
        {section === "devices" ? <DevicesSection r={r} product={product} /> : null}
        {section === "integrations" && !stays ? <ConsoleIntegrations r={r} plan={plan} /> : null}
        {section === "channel" && stays ? <ConsoleChannel name={r.name} /> : null}
        {section === "sandbox" && stays ? <ConsoleSandbox restaurantId={r.id} name={r.name} /> : null}
        {section === "activity" ? <ConsoleActivity restaurantId={r.id} /> : null}
      </div>
    </div>
  );
}

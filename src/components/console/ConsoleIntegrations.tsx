import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlaskConical, Lock, Minus, Plus, Send, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadIntegrations, loadSandboxMenu, sendTestOrder, setIntegration, type PlanRow, type RestaurantRow } from "@/lib/console-api";
import { integrationModeProblem, linkFor, PLATFORM_NAMES, PLATFORMS, quickSandboxPicks, sandboxDishes, sandboxLines, sandboxPrice, sandboxTotal, type IntegrationMode, type Platform } from "@/lib/aggregator-logic";
import { formatINR } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { Failed, Loading, field } from "./ConsoleBits";

/**
 * Console → restaurant → Swiggy & Zomato. Per restaurant: Off / Sandbox (Live stays locked until
 * the platforms' partner keys exist), the platform's store id, and a sandbox order composer that
 * drops a test order onto THIS restaurant's POS only.
 */
const MODES: { v: IntegrationMode; l: string }[] = [{ v: "off", l: "Off" }, { v: "sandbox", l: "Sandbox" }, { v: "live", l: "Live" }];
const TINT: Record<Platform, string> = { swiggy: "bg-[#fc8019] text-black", zomato: "bg-[#e23744] text-white" };

export function ConsoleIntegrations({ r, plan }: { r: RestaurantRow; plan: PlanRow | undefined }) {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["console", "integrations", r.id], queryFn: () => loadIntegrations(r.id), refetchInterval: 20_000 });
  const override = r.account?.featureOverrides?.aggregators;
  const allowed = override ?? plan?.features.aggregators === true;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["console", "integrations", r.id] });

  if (data.isLoading) return <Loading what="integrations" />;
  if (data.error || !data.data) return <Failed error={data.error} />;
  const { links, tests } = data.data;
  return (
    <div className="space-y-4">
      {!allowed ? (
        <p className="flex items-start gap-2 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-warning"><Lock className="mt-0.5 size-4 shrink-0" />
          {r.name} is on {plan?.name ?? "a plan"} without Swiggy & Zomato. It comes with Pro Lite, Pro and Enterprise / Brand — change the plan under Plan & billing, or switch the feature on there.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Live needs each platform's partner API keys and is locked until they're set up. Sandbox orders reach only this restaurant, arrive in its POS Billdesk under Bookings → QR orders with a chime, are marked "sandbox test", and bill as Swiggy/Zomato (their prices, GST paid by the platform).</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORMS.map((p) => <PlatformCard key={p} restaurantId={r.id} platform={p} link={linkFor(links, p)} allowed={allowed} onChanged={refresh} />)}
      </div>
      <div className="rounded-xl border border-border p-3">
        <h3 className="text-sm font-semibold">Last sandbox orders</h3>
        <ul className="mt-2 divide-y divide-border text-sm">
          {tests.map((t) => (
            <li key={`${t.code}-${t.at}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", TINT[t.platform])}>{PLATFORM_NAMES[t.platform]}</span>
              <span className="font-semibold">{t.code}</span>
              <span className="text-muted-foreground">{new Date(t.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              <span className="ml-auto tabular-nums">{formatINR(t.subtotal, 0)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", t.status === "new" ? "bg-gold/15 text-warning" : t.status === "completed" || t.status === "accepted" || t.status === "ready" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>
                {t.status === "new" ? "Waiting on the POS" : t.status}{t.billNo ? ` · ${t.billNo}` : ""}</span>
            </li>
          ))}
          {!tests.length ? <li className="py-2 text-muted-foreground">No sandbox orders yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}

function PlatformCard({ restaurantId, platform, link, allowed, onChanged }: { restaurantId: string; platform: Platform; link: ReturnType<typeof linkFor>; allowed: boolean; onChanged: () => void }) {
  const [storeId, setStoreId] = useState(link.storeId);
  const [busy, setBusy] = useState(false);
  const name = PLATFORM_NAMES[platform];
  const save = async (mode: IntegrationMode) => {
    const problem = integrationModeProblem(mode, allowed);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try { await setIntegration(restaurantId, platform, mode, storeId); toast.success(`${name}: ${mode === "off" ? "switched off" : `${mode} on`}`); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", TINT[platform])}>{name}</span>
          <span className="text-xs font-normal text-muted-foreground">{link.mode === "sandbox" ? "Sandbox on" : link.mode === "live" ? "Live" : "Off"}</span></h3>
        <span className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold" role="group" aria-label={`${name} mode`}>
          {MODES.map((m) => (
            <button key={m.v} type="button" disabled={busy || (m.v !== "off" && !allowed) || m.v === "live"} onClick={() => void save(m.v)} title={m.v === "live" ? "Needs partner API keys" : undefined}
              className={cn("inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-50", link.mode === m.v ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>
              {m.v === "live" ? <Lock className="size-3" /> : null}{m.l}
            </button>
          ))}
        </span>
      </div>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">{name} store / restaurant id <span className="font-normal">(optional in sandbox)</span>
        <div className="mt-1 flex gap-2">
          <input value={storeId} maxLength={60} spellCheck={false} onChange={(e) => setStoreId(e.target.value)} className={cn(field, "mt-0 font-mono")} />
          <Button size="sm" variant="outline" disabled={busy || storeId === link.storeId || link.mode === "off"} onClick={() => void save(link.mode)}>Save</Button>
        </div>
      </label>
      {link.mode === "sandbox" ? <SandboxComposer restaurantId={restaurantId} platform={platform} onSent={onChanged} /> : null}
    </section>
  );
}

function SandboxComposer({ restaurantId, platform, onSent }: { restaurantId: string; platform: Platform; onSent: () => void }) {
  const menu = useQuery({ queryKey: ["console", "sandbox-menu", restaurantId], queryFn: () => loadSandboxMenu(restaurantId), staleTime: 5 * 60_000 });
  const dishes = useMemo(() => sandboxDishes(menu.data ?? [], platform), [menu.data, platform]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const lines = sandboxLines(menu.data ?? [], picks, platform);
  const shown = dishes.filter((d) => !query.trim() || d.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40);
  const bump = (id: string, by: number) => setPicks((cur) => { const n = Math.max(0, Math.min(20, (cur[id] ?? 0) + by)); const next = { ...cur }; if (n) next[id] = n; else delete next[id]; return next; });
  const send = async () => {
    setBusy(true);
    try {
      const res = await sendTestOrder(restaurantId, platform, lines, customer);
      toast.success(`${PLATFORM_NAMES[platform]} test order ${res.code} sent · ${formatINR(res.subtotal, 0)}. It's ringing on the restaurant's POS now.`);
      setPicks({});
      onSent();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send the test order"); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg border border-dashed border-primary/50 bg-primary-tint/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><FlaskConical className="size-4 text-primary" />Send a sandbox order</p>
      {menu.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Loading the menu…</p> : null}
      {menu.error ? <p className="mt-2 text-xs text-destructive">{menu.error instanceof Error ? menu.error.message : "Couldn't load the menu"}</p> : null}
      {!menu.isLoading && !dishes.length && !menu.error ? <p className="mt-2 text-xs text-muted-foreground">This restaurant has no available, priced dishes yet.</p> : null}
      {dishes.length ? <>
        <div className="mt-2 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a dish" className={cn(field, "mt-0")} />
          <Button size="sm" variant="outline" onClick={() => setPicks(quickSandboxPicks(dishes, platform, 3))}><Shuffle />Quick 3</Button>
        </div>
        <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card text-sm">
          {shown.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate">{d.name}{d.category ? <span className="ml-1 text-xs text-muted-foreground">· {d.category}</span> : null}</span>
              <span className="tabular-nums text-xs text-muted-foreground">{formatINR(sandboxPrice(d, platform), 0)}</span>
              <span className="inline-flex items-center gap-1">
                <button type="button" aria-label={`One less ${d.name}`} onClick={() => bump(d.id, -1)} className="grid size-7 place-items-center rounded-md border border-border hover:bg-secondary"><Minus className="size-3.5" /></button>
                <span className="w-5 text-center tabular-nums">{picks[d.id] ?? 0}</span>
                <button type="button" aria-label={`One more ${d.name}`} onClick={() => bump(d.id, 1)} className="grid size-7 place-items-center rounded-md border border-border hover:bg-secondary"><Plus className="size-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">Guest name <span className="font-normal">(optional)</span>
            <input value={customer} maxLength={60} onChange={(e) => setCustomer(e.target.value)} placeholder={`${PLATFORM_NAMES[platform]} test guest`} className={field} />
          </label>
          <Button disabled={busy || !lines.length} onClick={() => void send()}><Send />{busy ? "Sending…" : lines.length ? `Send ${lines.reduce((s, l) => s + l.qty, 0)} items · ${formatINR(sandboxTotal(lines), 0)}` : "Pick dishes"}</Button>
        </div>
      </> : null}
    </div>
  );
}

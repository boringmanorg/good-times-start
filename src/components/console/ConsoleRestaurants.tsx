import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Check, MapPin, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ago, loadPlans, loadRestaurants, setTerminal, updateAccount, type PlanRow, type RestaurantRow } from "@/lib/console-api";
import { FEATURES, FEATURE_NAMES, SEAT_APPS, seatUseText, type Feature, type SeatApp } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Failed, Loading, Panel, field } from "./ConsoleBits";
import { ConsoleLogins } from "./ConsoleLogins";

const STATUSES = [
  { v: "active", l: "Active" }, { v: "trialing", l: "Trial" }, { v: "past_due", l: "Payment due" }, { v: "suspended", l: "Paused" }, { v: "cancelled", l: "Ended" },
];

export function ConsoleRestaurants() {
  const rows = useQuery({ queryKey: ["console", "restaurants"], queryFn: loadRestaurants, refetchInterval: 60_000 });
  const plans = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  if (rows.isLoading || plans.isLoading) return <Loading what="restaurants" />;
  if (rows.error || !rows.data) return <Failed error={rows.error} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Restaurants</h1>
        <p className="text-sm text-muted-foreground">Plans, subscriptions, feature switches, logins and devices. Payments happen outside the software: record renewals here.</p>
      </div>
      {rows.data.map((r) => <RestaurantCard key={r.id} r={r} plans={plans.data ?? []} />)}
    </div>
  );
}

function RestaurantCard({ r, plans }: { r: RestaurantRow; plans: PlanRow[] }) {
  const queryClient = useQueryClient();
  const a = r.account;
  const [plan, setPlan] = useState(a?.planId ?? "basic");
  const [status, setStatus] = useState(a?.status ?? "active");
  const [paidUntil, setPaidUntil] = useState(a?.paidUntil ? a.paidUntil.slice(0, 10) : "");
  const [complimentary, setComplimentary] = useState(a?.complimentary ?? false);
  const [seats, setSeats] = useState<Partial<Record<SeatApp, string>>>(() => Object.fromEntries(Object.entries(a?.seatOverrides ?? {}).map(([k, v]) => [k, String(v)])));
  const [features, setFeatures] = useState<Partial<Record<Feature, boolean>>>(a?.featureOverrides ?? {});
  const [notes, setNotes] = useState(a?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const planRow = plans.find((p) => p.id === plan);

  const save = async () => {
    if (!a) return;
    setBusy(true);
    try {
      const seatNums = Object.fromEntries(Object.entries(seats).filter(([, v]) => v !== undefined && v !== "" && /^\d{1,4}$/.test(v)).map(([k, v]) => [k, Number(v)]));
      await updateAccount({ id: a.id, plan, status, paidUntil: paidUntil ? new Date(`${paidUntil}T23:59:59+05:30`).toISOString() : null, complimentary, seats: seatNums, features, notes });
      toast.success(`${r.name}: subscription saved`);
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  };
  const device = async (id: string, action: "active" | "blocked" | "release") => {
    try { await setTerminal(r.id, id, action); toast.success(action === "release" ? "Device released" : action === "blocked" ? "Device blocked" : "Device activated"); await queryClient.invalidateQueries({ queryKey: ["console"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change the device"); }
  };

  return (
    <Panel title={r.name} action={<span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", a?.live ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>{a?.live ? "Live" : "Not live"}</span>}>
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">
        {r.city ? <><MapPin className="mr-0.5 inline size-3" />{r.city} · </> : null}{r.slug ? `/${r.slug} · ` : ""}joined {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        {" · "}last activity {ago(r.lastActivity)} · {r.bills30d} bill changes in 30 days · {r.guestOrders7d} QR orders in 7 days
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["pos", "waiter", "manager"] as SeatApp[]).map((app) => {
          const s = r.seats[app];
          const full = s.limit !== null && s.used >= s.limit && s.limit > 0;
          return <div key={app} className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">{SEAT_APPS[app]} devices</p>
            <p className={cn("text-xl font-bold tabular-nums", full && "text-warning")}>{s.limit === 0 ? "Not in plan" : seatUseText(s)}</p></div>;
        })}
      </div>

      {a ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Plan
                <select value={plan} onChange={(e) => setPlan(e.target.value)} className={field}>
                  {plans.filter((p) => p.active || p.id === a.planId).map((p) => <option key={p.id} value={p.id}>{p.name}{p.quote ? " (quote)" : ` · ₹${p.monthly_price}`}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>{STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
              </label>
              <label className="text-sm font-medium">Paid until <span className="font-normal text-muted-foreground">(blank = no end)</span>
                <input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} className={field} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
                <input type="checkbox" checked={complimentary} onChange={(e) => setComplimentary(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />Complimentary (not billed)
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Device seats <span className="font-normal text-muted-foreground">(blank = plan's)</span></legend>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["pos", "waiter", "manager"] as SeatApp[]).map((app) => {
                  const planSeats = app === "pos" ? planRow?.billdesk_seats : app === "waiter" ? planRow?.waiter_seats : planRow?.admin_seats;
                  return <label key={app} className="text-xs text-muted-foreground">{SEAT_APPS[app]}
                    <input inputMode="numeric" value={seats[app] ?? ""} placeholder={planSeats === null || planSeats === undefined ? "any" : String(planSeats)}
                      onChange={(e) => setSeats((s) => ({ ...s, [app]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className={field} /></label>;
                })}
              </div>
            </fieldset>
            <label className="block text-sm font-medium">Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className={field} />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Features <span className="font-normal text-muted-foreground">(Plan follows the plan; On/Off overrides it)</span></legend>
            <ul className="mt-2 space-y-1.5">
              {FEATURES.map((f) => {
                const fromPlan = planRow?.features[f] === true;
                const v = features[f];
                const set = (next: boolean | undefined) => setFeatures((cur) => { const c = { ...cur }; if (next === undefined) delete c[f]; else c[f] = next; return c; });
                return (
                  <li key={f} className="flex items-center justify-between gap-2 text-sm">
                    <span className={cn((v ?? fromPlan) ? "" : "text-muted-foreground")}>{FEATURE_NAMES[f]}</span>
                    <span className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border text-xs font-semibold">
                      {([["Plan", undefined], ["On", true], ["Off", false]] as const).map(([l, val]) => (
                        <button key={l} type="button" onClick={() => set(val)} className={cn("px-2.5 py-1", v === val ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>
                          {l === "Plan" ? `Plan (${fromPlan ? "on" : "off"})` : l}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="lg:col-span-2"><Button disabled={busy} onClick={() => void save()}><Save />{busy ? "Saving…" : "Save subscription"}</Button></div>
        </div>
      ) : <p className="mt-4 text-sm text-warning">This restaurant has no subscription account yet.</p>}

      <ConsoleLogins restaurantId={r.id} restaurantName={r.name} />

      <h3 className="mt-6 text-sm font-semibold">Devices</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-2 pr-3">Device</th><th className="pr-3">App</th><th className="pr-3">Login</th><th className="pr-3">Last seen</th><th className="pr-3">Status</th><th /></tr></thead>
          <tbody className="divide-y divide-border">
            {r.devices.map((d) => (
              <tr key={d.deviceId}>
                <td className="py-2 pr-3"><span className="font-medium">{d.description || d.series || d.deviceId.slice(0, 8)}</span><span className="block text-xs text-muted-foreground">{d.kind}{d.location ? ` · ${d.location}` : ""}</span></td>
                <td className="pr-3">{SEAT_APPS[d.app as SeatApp] ?? "—"}</td>
                <td className="pr-3 text-muted-foreground">{d.login.replace("@xtsy.pos", "")}</td>
                <td className="pr-3 text-muted-foreground">{ago(d.lastSeen)}</td>
                <td className="pr-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", d.status === "active" ? "bg-success/15 text-success" : d.status === "blocked" ? "bg-destructive/15 text-destructive" : "bg-gold/15 text-warning")}>
                  {d.status === "over_plan" ? "Waiting for a seat" : d.status === "blocked" ? "Blocked" : "Active"}</span></td>
                <td className="whitespace-nowrap text-right">
                  {d.status !== "active" ? <Button size="sm" variant="ghost" onClick={() => void device(d.deviceId, "active")}><Check />Activate</Button>
                    : <Button size="sm" variant="ghost" onClick={() => void device(d.deviceId, "blocked")}><Ban />Block</Button>}
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm("Release this device? It frees its seat; the device checks in again the next time it opens.")) void device(d.deviceId, "release"); }}><Trash2 />Release</Button>
                </td>
              </tr>
            ))}
            {!r.devices.length ? <tr><td colSpan={6} className="py-3 text-muted-foreground">No devices yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

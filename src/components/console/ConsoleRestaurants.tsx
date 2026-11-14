import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Check, History, IndianRupee, MapPin, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ago, loadPayments, loadPlans, loadRestaurants, recordPayment, saveRestaurantInfo, setTerminal, updateAccount, type PlanRow, type RestaurantRow } from "@/lib/console-api";
import { FEATURES, FEATURE_NAMES, SEAT_APPS, seatUseText, type Feature, type SeatApp } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Failed, Loading, Panel, field } from "./ConsoleBits";
import { ConsoleOnboard } from "./ConsoleOnboard";
import { consoleToken } from "@/lib/console-client";
import { platformRestaurantModels } from "@/lib/platform-restaurants.functions";
import { modelLabel } from "@/lib/platform-restaurant-logic";
import { ConsoleLogins } from "./ConsoleLogins";

const STATUSES = [
  { v: "active", l: "Active" }, { v: "trialing", l: "Trial" }, { v: "past_due", l: "Payment due" }, { v: "suspended", l: "Paused" }, { v: "cancelled", l: "Ended" },
];

export function ConsoleRestaurants() {
  const rows = useQuery({ queryKey: ["console", "restaurants"], queryFn: loadRestaurants, refetchInterval: 60_000 });
  const plans = useQuery({ queryKey: ["console", "plans"], queryFn: loadPlans });
  const models = useQuery({ queryKey: ["console", "models"], queryFn: async () => platformRestaurantModels({ data: { token: await consoleToken() } }) });
  if (rows.isLoading || plans.isLoading) return <Loading what="restaurants" />;
  if (rows.error || !rows.data) return <Failed error={rows.error} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">Restaurants</h1>
        <p className="text-sm text-muted-foreground">Plans, subscriptions, feature switches, logins and devices. Payments happen outside the software: record renewals here.</p>
      </div>
      <ConsoleOnboard plans={plans.data ?? []} />
      {rows.data.map((r) => <RestaurantCard key={r.id} r={r} plans={plans.data ?? []} model={models.data?.[r.id] ?? ""} />)}
    </div>
  );
}

/** Restaurant info is edited only here (exclusive to the super admin): name, QR address, city, billing contacts. */
function RestaurantInfo({ r }: { r: RestaurantRow }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(r.name);
  const [slug, setSlug] = useState(r.slug ?? "");
  const [city, setCity] = useState(r.city);
  const [phone, setPhone] = useState(r.account?.billingPhone ?? "");
  const [email, setEmail] = useState(r.account?.billingEmail ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = name !== r.name || slug !== (r.slug ?? "") || city !== r.city || phone !== (r.account?.billingPhone ?? "") || email !== (r.account?.billingEmail ?? "");
  const save = async () => {
    setBusy(true);
    try {
      await saveRestaurantInfo({ id: r.id, name, slug, city, billingPhone: phone, billingEmail: email });
      toast.success("Restaurant info saved");
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-4 rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold">Restaurant info <span className="font-normal text-muted-foreground">· changed only here; restaurants can't edit these themselves</span></h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium lg:col-span-2">Name
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="text-sm font-medium">QR address (slug)
          <input value={slug} maxLength={40} spellCheck={false} onChange={(e) => setSlug(e.target.value)} className={cn(field, "font-mono")} />
        </label>
        <label className="text-sm font-medium">City
          <input value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className={field} />
        </label>
        <label className="text-sm font-medium">Billing phone
          <input value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} className={field} />
        </label>
        <label className="text-sm font-medium lg:col-span-2">Billing email
          <input value={email} maxLength={120} inputMode="email" onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
      </div>
      {slug !== (r.slug ?? "") ? <p className="mt-2 text-xs text-warning">Changing the QR address breaks every printed QR card for /order/{r.slug ?? "…"} — reprint them after saving.</p> : null}
      <Button size="sm" className="mt-3" disabled={!dirty || busy || name.trim().length < 2} onClick={() => void save()}><Save />{busy ? "Saving…" : "Save info"}</Button>
    </div>
  );
}

/**
 * Renewals and payment status live here and nowhere else: restaurants have no self-serve path.
 * Recording a payment moves the paid-until date forward (never losing time already paid for) and
 * makes the account live again.
 */
function Renewal({ r, price }: { r: RestaurantRow; price: number }) {
  const queryClient = useQueryClient();
  const a = r.account!;
  const [amount, setAmount] = useState(String(price));
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const payments = useQuery({ queryKey: ["console", "payments", a.id], queryFn: () => loadPayments(a.id), enabled: showHistory });

  const from = a.paidUntil && Date.parse(a.paidUntil) > Date.now() ? new Date(a.paidUntil) : new Date();
  const until = new Date(from); until.setMonth(until.getMonth() + months);
  const save = async () => {
    setBusy(true);
    try {
      const res = await recordPayment({ account: a.id, amount: Number(amount || 0), months, method, reference });
      toast.success(`Payment recorded · live until ${new Date(res.paidUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`);
      setReference("");
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't record the payment"); }
    finally { setBusy(false); }
  };

  return (
    <div className={cn("mt-4 rounded-xl border p-3", a.live ? "border-border" : "border-gold/60 bg-gold/10")}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><IndianRupee className="size-4 text-primary" />Renewal and payment
        <span className="font-normal text-muted-foreground">· only XTSY can renew; restaurants cannot pay themselves in</span></h3>
      {!a.live ? <p className="mt-1 text-xs font-semibold text-warning">This restaurant is stopped right now. Recording a payment switches it back on at once.</p> : null}
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium">Amount received (₹)
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))} className={cn(field, "tabular-nums")} />
        </label>
        <label className="text-sm font-medium">Renew for
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={field}>
            {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Paid by
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            {[["upi", "UPI"], ["cash", "Cash"], ["bank", "Bank transfer"], ["card", "Card"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium lg:col-span-2">Reference <span className="font-normal text-muted-foreground">(UPI ref, receipt no.)</span>
          <input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} className={field} />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        New paid-until date: <strong className="text-foreground">{until.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
        {a.paidUntil && Date.parse(a.paidUntil) > Date.now() ? " (added to the time already paid for)" : " (from today)"} · the restaurant keeps working for 7 days after it, then stops.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}><IndianRupee />{busy ? "Recording…" : "Record payment and renew"}</Button>
        <Button size="sm" variant="outline" onClick={() => setShowHistory((v) => !v)}><History />{showHistory ? "Hide payments" : "Payment history"}</Button>
      </div>
      {showHistory ? (
        <ul className="mt-3 space-y-1.5 text-xs">
          {payments.isLoading ? <li className="text-muted-foreground">Loading…</li> : null}
          {(payments.data ?? []).map((p) => (
            <li key={p.at} className="flex flex-wrap justify-between gap-2 rounded-lg bg-secondary px-2.5 py-1.5">
              <span>{new Date(p.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ₹{Number(p.detail.amount).toLocaleString("en-IN")} · {p.detail.method}{p.detail.reference ? ` · ${p.detail.reference}` : ""}</span>
              <span className="text-muted-foreground">{p.detail.months} month{p.detail.months === 1 ? "" : "s"} → {new Date(p.detail.until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            </li>
          ))}
          {!payments.isLoading && !(payments.data ?? []).length ? <li className="text-muted-foreground">No payments recorded yet.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function RestaurantCard({ r, plans, model }: { r: RestaurantRow; plans: PlanRow[]; model: string }) {
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
        {modelLabel(model) ? <>{modelLabel(model)} · </> : null}{r.city ? <><MapPin className="mr-0.5 inline size-3" />{r.city} · </> : null}{r.slug ? `/${r.slug} · ` : ""}joined {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        {" · "}last activity {ago(r.lastActivity)} · {r.bills30d} bill changes in 30 days · {r.guestOrders7d} QR orders in 7 days
      </p>

      <RestaurantInfo r={r} />

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
          <div className="lg:col-span-2"><Renewal r={r} price={planRow?.monthly_price ?? 0} /></div>
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
                  {d.status === "over_plan" ? "Waiting for a seat" : d.status === "pending" ? "Waiting for approval" : d.status === "blocked" ? "Blocked" : "Active"}</span></td>
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

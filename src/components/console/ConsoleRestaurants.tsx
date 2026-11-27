import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Check, History, IndianRupee, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ago, loadAccountPrices, loadPayments, recordPayment, saveRestaurantInfo, setAccountPrice, setTerminal, updateAccount, type AccountPrice, type PlanRow, type RestaurantRow } from "@/lib/console-api";
import { clientTerms, featureName, featuresFor, SEAT_APPS, seatAppsFor, seatUseText, stayPlanTotal, type Feature, type SeatApp } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { field } from "./ConsoleBits";
import { planProduct, STAY_PRODUCTS, type ProductId } from "@/lib/products";

const STATUSES = [
  { v: "active", l: "Active" }, { v: "trialing", l: "Trial" }, { v: "past_due", l: "Payment due" }, { v: "suspended", l: "Paused" }, { v: "cancelled", l: "Ended" },
];

/** Restaurant info is edited only here (exclusive to the super admin): name, QR address, city, billing contacts. */
export function RestaurantInfo({ r }: { r: RestaurantRow }) {
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
function Renewal({ r, price, terms }: { r: RestaurantRow; price: number; terms: { includedRooms: number | null; extraRoomPrice: number | null } }) {
  const queryClient = useQueryClient();
  const a = r.account!;
  // Plans priced by rooms: the monthly amount follows the property's room count (client's own terms first).
  const roomPriced = terms.includedRooms != null && !!terms.extraRoomPrice;
  const [rooms, setRooms] = useState(String(terms.includedRooms ?? ""));
  const monthly = roomPriced ? stayPlanTotal({ price, includedRooms: terms.includedRooms, extraRoomPrice: terms.extraRoomPrice }, Number(rooms || 0)) ?? price : price;
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
        {roomPriced ? (
          <label className="text-sm font-medium">Rooms at the property
            <input value={rooms} inputMode="numeric" onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4); setRooms(v); setAmount(String(stayPlanTotal({ price, includedRooms: terms.includedRooms, extraRoomPrice: terms.extraRoomPrice }, Number(v || 0)) ?? price)); }} className={cn(field, "tabular-nums")} />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{terms.includedRooms} rooms included · ₹{terms.extraRoomPrice} per extra room · ₹{monthly.toLocaleString("en-IN")} a month</span>
          </label>
        ) : null}
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

/** Device seats in use per app, from the plan (or its overrides). */
export function SeatsSummary({ r, product }: { r: RestaurantRow; product?: string | undefined }) {
  const names = Object.fromEntries(seatAppsFor(product)) as Partial<Record<SeatApp, string>>;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {seatAppsFor(product).map(([app]) => {
        const s = r.seats[app];
        const full = s.limit !== null && s.used >= s.limit && s.limit > 0;
        return <div key={app} className="rounded-xl bg-secondary p-3"><p className="text-xs text-muted-foreground">{names[app]} devices</p>
          <p className={cn("text-xl font-bold tabular-nums", full && "text-warning")}>{s.limit === 0 ? "Not in plan" : seatUseText(s)}</p></div>;
      })}
    </div>
  );
}

/** Plan, status, paid-until, seat and feature overrides, then renewal and payments. */
export function SubscriptionSection({ r, plans, product = "restaurant_pos" }: { r: RestaurantRow; plans: PlanRow[]; product?: ProductId }) {
  const stays = STAY_PRODUCTS.includes(product);
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
  if (!a) return <p className="text-sm text-warning">This restaurant has no subscription account yet.</p>;

  const save = async () => {
    setBusy(true);
    try {
      const seatNums = Object.fromEntries(Object.entries(seats).filter(([, v]) => v !== undefined && v !== "" && /^\d{1,4}$/.test(v)).map(([k, v]) => [k, Number(v)]));
      await updateAccount({ id: a.id, plan, status, paidUntil: paidUntil ? new Date(`${paidUntil}T23:59:59+05:30`).toISOString() : null, complimentary, seats: seatNums, features, notes });
      toast.success(`${r.name}: subscription saved`);
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Plan
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={field}>
              {plans.filter((p) => ((p.active && planProduct(p.id) === product) || p.id === a.planId)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.quote ? " (quote)" : ` · ₹${p.monthly_price}`}</option>)}
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
            {seatAppsFor(stays ? "hostel_pos" : "restaurant_pos").map(([app, label]) => {
              const planSeats = app === "pos" ? planRow?.billdesk_seats : app === "waiter" ? planRow?.waiter_seats : planRow?.admin_seats;
              return <label key={app} className="text-xs text-muted-foreground">{label}
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
          {featuresFor(stays).map((f) => {
            const fromPlan = planRow?.features[f] === true;
            const v = features[f];
            const set = (next: boolean | undefined) => setFeatures((cur) => { const c = { ...cur }; if (next === undefined) delete c[f]; else c[f] = next; return c; });
            return (
              <li key={f} className="flex items-center justify-between gap-2 text-sm">
                <span className={cn((v ?? fromPlan) ? "" : "text-muted-foreground")}>{featureName(f, stays)}</span>
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
      {planRow ? <div className="lg:col-span-2"><ClientPrice r={r} planRow={planRow} onPlan={plan === a.planId} stays={stays} /></div> : null}
    </div>
  );
}

/**
 * What this client pays. The plan's list price applies unless the client has its own price: an
 * initial offer set here, or the earlier price kept automatically when the plan's price changed.
 * Moving the client to another plan drops its own price (the cloud does that).
 */
function ClientPrice({ r, planRow, onPlan, stays }: { r: RestaurantRow; planRow: PlanRow; onPlan: boolean; stays: boolean }) {
  const queryClient = useQueryClient();
  const a = r.account!;
  const prices = useQuery({ queryKey: ["console", "account-prices"], queryFn: loadAccountPrices });
  const own: AccountPrice | undefined = onPlan ? prices.data?.[a.id] : undefined;
  const terms = clientTerms(planRow, own);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [rooms, setRooms] = useState("");
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const roomPlan = stays && planRow.included_rooms != null;
  const open = () => {
    setPrice(String(terms.price)); setRooms(terms.includedRooms == null ? "" : String(terms.includedRooms));
    setExtra(terms.extraRoomPrice == null ? "" : String(terms.extraRoomPrice)); setNote(own?.note ?? ""); setEditing(true);
  };
  const save = async (clear = false) => {
    setBusy(true);
    try {
      await setAccountPrice({ account: a.id, price: clear ? null : Number(price || 0), includedRooms: clear || !roomPlan || rooms === "" ? null : Number(rooms),
        extraRoomPrice: clear || !roomPlan || rooms === "" ? null : Number(extra || 0), note: clear ? "" : note });
      toast.success(clear ? `${r.name} is back on the ${planRow.name} list price` : `${r.name}: own price saved`);
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the price"); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><IndianRupee className="size-4 text-primary" />Client price</h3>
            <p className="mt-1 text-sm">
              <span className="text-xl font-bold tabular-nums">₹{terms.price.toLocaleString("en-IN")}</span> a month
              {terms.includedRooms != null ? <span className="text-muted-foreground"> · {terms.includedRooms} rooms included · ₹{terms.extraRoomPrice ?? 0} per extra room</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {!onPlan ? "Save the subscription first: a new plan starts on its list price." : terms.own ? `Own price · list price ₹${planRow.monthly_price.toLocaleString("en-IN")}${own?.note ? ` · ${own.note}` : ""}` : `${planRow.name} list price`}
            </p>
          </div>
          {onPlan && !editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={open}>{terms.own ? "Change price" : "Set an offer price"}</Button>
              {terms.own ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`Put ${r.name} back on the ${planRow.name} list price (₹${planRow.monthly_price.toLocaleString("en-IN")})?`)) void save(true); }}>Use list price</Button> : null}
            </div>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Monthly price (₹)<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 7))} className={cn(field, "tabular-nums")} /></label>
            {roomPlan ? <>
              <label className="text-sm font-medium">Rooms included<input inputMode="numeric" value={rooms} onChange={(e) => setRooms(e.target.value.replace(/\D/g, "").slice(0, 4))} className={cn(field, "tabular-nums")} /></label>
              <label className="text-sm font-medium">₹ per extra room<input inputMode="numeric" value={extra} disabled={rooms === ""} onChange={(e) => setExtra(e.target.value.replace(/\D/g, "").slice(0, 6))} className={cn(field, "tabular-nums")} /></label>
            </> : null}
            <label className="text-sm font-medium sm:col-span-2 lg:col-span-4">Why this price (the offer)<input value={note} maxLength={200} placeholder="e.g. Launch offer for the first 6 months" onChange={(e) => setNote(e.target.value)} className={field} /></label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={busy || !price || note.trim().length < 3} onClick={() => void save()}><Save />{busy ? "Saving…" : "Save client price"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </div>
      <Renewal key={`${planRow.id}-${terms.price}-${terms.includedRooms ?? ""}-${terms.extraRoomPrice ?? ""}`} r={r} price={terms.price} terms={terms} />
    </div>
  );
}

/** The restaurant's devices: activate, block or release each one. */
export function DevicesSection({ r, product }: { r: RestaurantRow; product?: string | undefined }) {
  const appName = (a: string) => (Object.fromEntries(seatAppsFor(product)) as Record<string, string>)[a] ?? SEAT_APPS[a as SeatApp] ?? "—";
  const queryClient = useQueryClient();
  const device = async (id: string, action: "active" | "blocked" | "release") => {
    try { await setTerminal(r.id, id, action); toast.success(action === "release" ? "Device released" : action === "blocked" ? "Device blocked" : "Device activated"); await queryClient.invalidateQueries({ queryKey: ["console"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change the device"); }
  };
  return (
    <div className="space-y-4">
      <SeatsSummary r={r} product={product} />
      <div className="overflow-x-auto rounded-xl border border-border px-3">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-2 pr-3">Device</th><th className="pr-3">App</th><th className="pr-3">Login</th><th className="pr-3">Last seen</th><th className="pr-3">Status</th><th /></tr></thead>
          <tbody className="divide-y divide-border">
            {r.devices.map((d) => (
              <tr key={d.deviceId}>
                <td className="py-2 pr-3"><span className="font-medium">{d.description || d.series || d.deviceId.slice(0, 8)}</span><span className="block text-xs text-muted-foreground">{d.kind}{d.location ? ` · ${d.location}` : ""}</span></td>
                <td className="pr-3">{appName(d.app)}</td>
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
    </div>
  );
}

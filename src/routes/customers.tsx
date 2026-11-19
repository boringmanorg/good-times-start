import { useLoyaltyPct } from "@/lib/use-loyalty";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { BadgePercent, Download, MessageCircle, Search, Send, Star } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { setWhatsappConsent } from "@/lib/marketing-actions";
import { waLink } from "@/lib/marketing-logic";
import { AppShell } from "@/components/AppShell";
import { useRestaurantSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getDb } from "@/lib/db";
import { isAdmin, useStaff } from "@/lib/staff";
import { formatINR } from "@/lib/billing";
import { billMessage, customerStats, guestDiscount, guestGetsMessages, normalisePhone, ordersByCustomer, type CustomerStats } from "@/lib/customer-logic";
import { adjustPoints, recordDuePayment, rememberGuestsFromBills, updateCustomer } from "@/lib/customer-actions";
import { guestsWorkbook } from "@/lib/report-excel";
import { downloadXlsx } from "@/lib/xlsx";
import type { Customer, Order, PaymentMode } from "@/lib/types";
import { Dropdown } from "@/components/Dropdown";
import { ConfirmButton } from "@/components/ConfirmButton";
import { can } from "@/lib/permissions";
import { BillPrintButton } from "@/components/BillPrintButton";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { loadBrandingAndMarketing } from "@/lib/marketing-actions";
import { reviewMessage } from "@/lib/review-request";
import { featureOn } from "@/lib/plans";
import { useEntitlements } from "@/lib/use-entitlements";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers — XTSY POS" },
      { name: "description", content: "Guests, visits, loyalty points, dues and feedback from every bill." }, { property: "og:title", content: "Customers — XTSY POS" }, { property: "og:description", content: "Guests, visits, loyalty points, dues and feedback from every bill." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },],
  }),
  component: CustomersPage,
});

type Filter = "all" | "priority" | "due" | "points" | "feedback" | "whatsapp";
type Sort = "recent" | "visits" | "spent" | "name";
const inputClass = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm";

function initials(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "G") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "warn" | undefined }) {
  return <div className={cn("rounded-2xl border bg-card p-3 sm:p-4", tone === "warn" ? "border-gold/60" : "border-border")}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn("mt-1 text-lg font-bold tabular-nums sm:text-xl", tone === "warn" && "text-warning")}>{value}</p>
    <p className="text-xs text-muted-foreground">{note}</p>
  </div>;
}

function formatPhone(id: string) {
  return id.length === 10 ? `${id.slice(0, 5)} ${id.slice(5)}` : id;
}

function CustomerDetail({ customer, stats, orders, loyaltyOn, onClose }: { customer: Customer; stats: CustomerStats; orders: Order[]; loyaltyOn: boolean; onClose: () => void }) {
  const { user } = useStaff();
  const admin = can(user, "guests.points");
  const [name, setName] = useState(customer.name ?? "");
  const [note, setNote] = useState(customer.note ?? "");
  const [amount, setAmount] = useState(stats.due ? String(stats.due) : "");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [points, setPoints] = useState("");
  const visits = orders.filter((o) => o.status === "settled" && normalisePhone(o.customer?.phone) === customer.id).sort((a, b) => b.createdAt - a.createdAt);

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateCustomer({ ...customer, ...(name.trim() ? { name: name.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    toast.success("Guest details saved");
  };
  const collect = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > stats.due) { toast.error(`Enter an amount up to ${formatINR(stats.due)}`); return; }
    await recordDuePayment(customer.id, value, mode, user?.displayName);
    toast.success(`${formatINR(value)} received`);
    onClose();
  };
  const changePoints = async () => {
    const value = Math.round(Number(points));
    if (!Number.isFinite(value) || value === 0) return;
    await adjustPoints(customer.id, value);
    toast.success(value > 0 ? `${value} points added` : `${-value} points removed`);
    setPoints("");
  };

  return (
    <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [scrollbar-gutter:stable]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Visits" value={String(stats.visits)} />
        <Stat label="Spent" value={formatINR(stats.spent, 0)} />
        <Stat label={loyaltyOn ? "Points" : "Rating"} value={loyaltyOn ? String(stats.points) : stats.averageRating !== null ? `${stats.averageRating}/5` : "—"} />
        <Stat label="Last visit" value={stats.lastVisit ? new Date(stats.lastVisit).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"} />
      </div>

      {stats.due > 0 ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <h3 className="text-sm font-semibold">{formatINR(stats.due)} due</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input aria-label="Amount received" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-lg border border-input bg-card px-2 py-2 text-right text-sm" />
            <Dropdown<PaymentMode> ariaLabel="Paid by" className="w-28" value={mode} onChange={setMode}
              options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }]} />
            <ConfirmButton id="collect-due" onConfirm={collect} className={buttonVariants()} armedClassName="!bg-gold !text-gold-foreground" confirm="Tap again to record">Record payment</ConfirmButton>
          </div>
        </section>
      ) : null}

      <GuestSettings customer={customer} editable={isAdmin(user)} />
      <section aria-label="WhatsApp" className="space-y-3 rounded-xl border border-border p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="size-4 text-success" />WhatsApp</h3>
        <TestMessage customer={customer} lastBill={visits[0]} />
        <ReviewRequest customer={customer} />
        <WhatsappConsent customer={customer} />
      </section>

      <form className="space-y-3 rounded-xl border border-border p-3" onSubmit={(event) => void saveDetails(event)}>
        <h3 className="text-sm font-semibold">Details</h3>
        <label className="block text-sm font-medium">Name<input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm font-medium">Note<input maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Allergic to nuts, likes the window table…" className={inputClass} /></label>
        <Button type="submit" variant="secondary">Save details</Button>
      </form>

      {loyaltyOn && admin ? (
        <div className="flex items-end gap-2">
          <label className="block text-sm font-medium">Add or remove points
            <input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="e.g. 50 or -20" className={inputClass} />
          </label>
          <ConfirmButton id="change-points" onConfirm={changePoints} className={buttonVariants({ variant: "outline" })} armedClassName="!bg-gold !text-gold-foreground" confirm="Tap again">Apply</ConfirmButton>
        </div>
      ) : null}

      <section>
        <h3 className="text-sm font-semibold">Visits</h3>
        {visits.length ? (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {visits.slice(0, 30).map((o) => (
              <li key={o.uid ?? o.billNo} className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-x-2"><span>{new Date(o.createdAt).toLocaleDateString("en-IN")} <span className="text-muted-foreground">{o.billNo}</span></span><span className="font-semibold">{formatINR(o.total, 0)}</span></div>
                <div className="truncate text-xs text-muted-foreground" title={o.lines.map((l) => `${l.qty} ${l.name}`).join(", ")}>{o.lines.map((l) => `${l.qty} ${l.name}`).join(", ")}</div>
                {o.feedback ? <div className="mt-0.5 text-xs"><span className="font-semibold text-warning">{o.feedback.rating}/5</span>{o.feedback.comment ? ` "${o.feedback.comment}"` : ""}</div> : null}
                </div><BillPrintButton order={o} className="shrink-0" />
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-muted-foreground">No settled bills yet.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-secondary px-3 py-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="truncate text-lg font-bold tabular-nums">{value}</div></div>;
}

/** Priority, standing discount and bill messages. The owner or a manager changes them; everyone sees them. */
function GuestSettings({ customer, editable }: { customer: Customer; editable: boolean }) {
  const [discount, setDiscount] = useState(guestDiscount(customer) ? String(guestDiscount(customer)) : "");
  const save = async (change: Partial<Customer>, message: string) => {
    await updateCustomer({ ...customer, ...change });
    toast.success(message);
  };
  const saveDiscount = async () => {
    const raw = discount.trim();
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) { toast.error("Enter a discount from 0 to 100%"); return; }
    const { discountPct: _old, ...rest } = customer;
    await updateCustomer(value ? { ...rest, discountPct: Math.round(value * 100) / 100 } : rest);
    toast.success(value ? `${customer.name || "Guest"} gets ${value}% off every bill` : "Guest discount removed");
  };
  return (
    <section aria-label="Guest settings" className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Guest settings</h3>{!editable ? <span className="text-[11px] text-muted-foreground">Set by the owner or a manager</span> : null}</div>
      <div className="flex items-start gap-3">
        <Switch checked={!!customer.priority} disabled={!editable} aria-label="Priority guest" className="mt-0.5"
          onCheckedChange={(v) => void save({ priority: v }, v ? "Marked as a priority guest" : "No longer a priority guest")} />
        <div className="min-w-0"><p className="flex items-center gap-1 text-sm font-medium"><Star className="size-3.5 fill-primary text-primary" />Priority guest</p>
          <p className="text-xs text-muted-foreground">Starred in the guest list, in name suggestions and on their bill.</p></div>
      </div>
      <div className="flex items-start gap-3">
        <BadgePercent className="mt-1 size-5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Guest discount</p>
          <p className="text-xs text-muted-foreground">Goes on their bill automatically when they're picked. Staff can still change it on the bill.</p>
          <div className="mt-2 flex items-center gap-2">
            <input aria-label="Guest discount %" inputMode="decimal" disabled={!editable} value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-20 rounded-lg border border-input bg-card px-2 py-2 text-right text-sm tabular-nums disabled:opacity-60" />
            <span className="text-sm text-muted-foreground">%</span>
            {editable ? <Button size="sm" variant="outline" onClick={() => void saveDiscount()}>Save</Button> : null}
          </div>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Switch checked={guestGetsMessages(customer)} disabled={!editable || !normalisePhone(customer.phone)} aria-label="Bill messages on WhatsApp" className="mt-0.5"
          onCheckedChange={(v) => void save({ billMessages: v }, v ? "Bill messages on" : "Bill messages off for this guest")} />
        <div className="min-w-0"><p className="text-sm font-medium">Bill messages on WhatsApp</p>
          <p className="text-xs text-muted-foreground">On for every guest by default: after settling, the counter is offered “Send bill on WhatsApp”. Offers are separate, below.</p></div>
      </div>
    </section>
  );
}

/** One tap to check WhatsApp works for this guest: their last bill, or a hello if they have none. */
function TestMessage({ customer, lastBill }: { customer: Customer; lastBill: Order | undefined }) {
  const restaurant = useRestaurantSettings().name;
  const text = lastBill ? billMessage(lastBill, restaurant) : `Hi ${(customer.name ?? "").split(" ")[0] || "there"}, this is ${restaurant || "us"} checking WhatsApp messages from our billing. No need to reply.`;
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="text-sm font-medium">{lastBill ? `Send their last bill (${lastBill.billNo})` : "Send a test message"}</p>
      <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{text}</pre>
      <a href={waLink(customer.phone, text)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm" }), "mt-2")}><Send />Open in WhatsApp</a>
    </div>
  );
}

/** Thank-you on WhatsApp pointing the guest to the Google profile and Instagram (Pro and up). */
function ReviewRequest({ customer }: { customer: Customer }) {
  const { user } = useStaff();
  const on = featureOn(useEntitlements(), "feedback");
  const restaurant = useRestaurantSettings().name;
  const { data } = useQuery({
    queryKey: ["branding", user?.restaurantId],
    enabled: on && !!user?.restaurantId,
    queryFn: () => loadBrandingAndMarketing(user?.restaurantId ?? ""),
    staleTime: 5 * 60_000,
  });
  if (!on) return null;
  const text = reviewMessage({ guest: customer.name, restaurant, links: data?.branding?.links });
  return (
    <div className="rounded-lg bg-secondary p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium"><Star className="size-4 text-primary" />Ask for a review</h3>
      {text ? <>
        <p className="mt-1 text-xs text-muted-foreground">Opens WhatsApp with a thank-you and your Google review and Instagram links.</p>
        <a href={waLink(customer.id, text)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "sm" }), "mt-2")}><Send />Send on WhatsApp</a>
      </> : <p className="mt-1 text-xs text-muted-foreground">Add your Google review and Instagram links in Marketing → Brand to send review requests.</p>}
    </div>
  );
}

/** The guest's yes or no to WhatsApp offers. Staff record it only when the guest agrees. */
function WhatsappConsent({ customer }: { customer: Customer }) {
  const { user } = useStaff();
  const [optIn, setOptIn] = useState(!!customer.whatsapp?.optIn);
  const allowed = can(user, "guests.consent");
  const change = async (value: boolean) => {
    setOptIn(value);
    await setWhatsappConsent(customer.phone, value, "in person");
    toast.success(value ? "Recorded: happy to get offers on WhatsApp" : "Recorded: no WhatsApp offers");
  };
  const since = customer.whatsapp?.at ? new Date(customer.whatsapp.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  return (
    <div className="flex items-start gap-3 rounded-lg bg-secondary p-3 text-sm">
      <Switch checked={optIn} disabled={!allowed} onCheckedChange={(v) => void change(v)} className="mt-0.5" aria-label="Agreed to WhatsApp offers" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Agreed to offers on WhatsApp</p>
        <p className="text-xs text-muted-foreground">{customer.whatsapp ? `${optIn ? "Yes" : "No"} since ${since}${customer.whatsapp.source ? `, ${customer.whatsapp.source}` : ""}` : "Turn on only when the guest says yes."}</p>
      </div>
      <a href={waLink(customer.phone, `Hi ${(customer.name ?? "").split(" ")[0] || "there"}!`)} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}><Send />Chat</a>
    </div>
  );
}

function CustomersPage() {
  const settings = useRestaurantSettings();
  const loyaltyPct = useLoyaltyPct(1);
  const customers = useLiveQuery(() => getDb().customers.toArray(), [], []);
  // Only bills with a guest attached, straight from the guest index; not the whole year's bills.
  const orders = useLiveQuery(async () => (await getDb().orders.where("customerId").above("").toArray()).filter((o) => o.status === "settled"), [], []);
  // Guests on running bills (hotel stays pay later) belong on the list too.
  const billGuestCount = useLiveQuery(() => getDb().orders.where("customerId").above("").count(), [], 0);
  useEffect(() => { void rememberGuestsFromBills(); }, [billGuestCount]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [openId, setOpenId] = useState<string | null>(null);

  // One pass over bills for every guest (not every guest against every bill).
  const rows = useMemo(() => {
    const byGuest = ordersByCustomer(orders);
    return customers.map((c) => ({ customer: c, stats: customerStats(c, byGuest.get(c.id) ?? [], loyaltyPct) }));
  }, [customers, orders, loyaltyPct]);
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const shown = rows
    .filter(({ customer }) => !term || (customer.name ?? "").toLowerCase().includes(term) || (digits.length >= 3 && customer.id.includes(digits)))
    .filter(({ customer, stats }) => filter === "all" || (filter === "priority" && !!customer.priority) || (filter === "due" && stats.due > 0) || (filter === "points" && stats.points > 0) || (filter === "feedback" && stats.averageRating !== null) || (filter === "whatsapp" && !!customer.whatsapp?.optIn))
    .sort((a, b) => sort === "visits" ? b.stats.visits - a.stats.visits : sort === "spent" ? b.stats.spent - a.stats.spent
      : sort === "name" ? (a.customer.name ?? "").localeCompare(b.customer.name ?? "") : (b.stats.lastVisit ?? 0) - (a.stats.lastVisit ?? 0));
  const priorityCount = rows.filter((r) => r.customer.priority).length;
  const offersYes = rows.filter((r) => r.customer.whatsapp?.optIn).length;
  const totalDue = rows.reduce((s, r) => s + r.stats.due, 0);
  const rated = rows.filter((r) => r.stats.averageRating !== null);
  const open = rows.find((r) => r.customer.id === openId) ?? null;

  const filters: { v: Filter; l: string }[] = [
    { v: "all", l: "All" },
    { v: "priority", l: "Priority" },
    { v: "due", l: "Owe money" },
    ...(loyaltyPct > 0 ? [{ v: "points" as const, l: "Have points" }] : []),
    { v: "whatsapp" as const, l: "Offers: yes" },
    { v: "feedback", l: "Gave feedback" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-4 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Guests</h1>
            <p className="text-sm text-muted-foreground">Everyone billed with a mobile number{loyaltyPct > 0 ? ` · guests earn ${loyaltyPct}% back as points` : ""}.</p>
          </div>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => downloadXlsx(`guests-${new Date().toISOString().slice(0, 10)}`, guestsWorkbook(rows, settings.name), { title: "Guests" })}><Download />Excel</Button>
        </div>
        <div className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Guests" value={String(rows.length)} note={rated.length ? `Rated ${(rated.reduce((s, r) => s + (r.stats.averageRating ?? 0), 0) / rated.length).toFixed(1)} on average` : "No ratings yet"} />
          <Kpi label="Priority guests" value={String(priorityCount)} note="Starred on their bills" />
          <Kpi label="Owed to you" value={formatINR(totalDue, 0)} note={totalDue ? "Bills paid as Due" : "Nothing owed"} tone={totalDue ? "warn" : undefined} />
          <Kpi label="Offers on WhatsApp" value={String(offersYes)} note="Guests who said yes" />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" aria-label="Find a guest" className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <Dropdown<Sort> ariaLabel="Sort guests" className="w-40" value={sort} onChange={setSort}
            options={[{ value: "recent", label: "Recent visit" }, { value: "visits", label: "Most visits" }, { value: "spent", label: "Most spent" }, { value: "name", label: "A–Z" }]} />
        </div>
        <div className="mb-4 flex max-w-full gap-1.5 overflow-x-auto">
          {filters.map((f) => (
            <Button key={f.v} size="sm" variant={filter === f.v ? "default" : "secondary"} onClick={() => setFilter(f.v)} className="shrink-0">{f.l}</Button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-semibold">No guests yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a guest's phone number on a bill and they appear here, with their visits and points.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {shown.map(({ customer, stats }) => (
              <li key={customer.id}>
                <button type="button" onClick={() => setOpenId(customer.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60">
                  <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", customer.priority ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>{initials(customer.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="truncate">{customer.name || "Guest"}</span>{customer.priority ? <Star aria-label="Priority guest" className="size-3.5 shrink-0 fill-primary text-primary" /> : null}<span className="shrink-0 font-normal tabular-nums text-muted-foreground">{formatPhone(customer.id)}</span></div>
                    <div className="truncate text-xs text-muted-foreground">
                      {stats.visits} visit{stats.visits === 1 ? "" : "s"}, {formatINR(stats.spent, 0)} spent
                      {stats.lastVisit ? `, last ${new Date(stats.lastVisit).toLocaleDateString("en-IN")}` : ""}
                    </div>
                  </div>
                  {guestDiscount(customer) ? <span title="Guest discount" className="rounded bg-success/10 px-1.5 py-0.5 text-xs font-semibold text-success">{guestDiscount(customer)}% off</span> : null}
                  {customer.whatsapp?.optIn ? <span title="Agreed to WhatsApp offers" className="flex items-center gap-0.5 rounded bg-success/10 px-1.5 py-0.5 text-xs font-semibold text-success"><Send className="size-3" />WA</span> : null}
                  {stats.averageRating !== null ? <span className="flex items-center gap-0.5 text-xs font-semibold"><Star className="size-3.5 fill-gold text-gold" />{stats.averageRating}</span> : null}
                  {loyaltyPct > 0 && stats.points > 0 ? <span className="rounded bg-primary-tint px-1.5 py-0.5 text-xs font-semibold">{stats.points} pts</span> : null}
                  {stats.due > 0 ? <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">{formatINR(stats.due, 0)} due</span> : null}
                </button>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No guests match.</li> : null}
          </ul>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="flex h-[min(48rem,92dvh)] w-[calc(100%-1rem)] max-w-lg min-w-0 flex-col overflow-hidden p-4 sm:p-6">
          {open ? <>
            <DialogTitle className="flex min-w-0 shrink-0 items-center gap-3 pr-8">
              <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-full text-base font-bold", open.customer.priority ? "bg-primary text-primary-foreground" : "bg-secondary")}>{initials(open.customer.name)}</span>
              <span className="min-w-0"><span className="flex items-center gap-1.5 break-words">{open.customer.name || "Guest"}{open.customer.priority ? <Star aria-label="Priority guest" className="size-4 shrink-0 fill-primary text-primary" /> : null}</span>
                <span className="mt-0.5 block text-sm font-normal tabular-nums text-muted-foreground">{formatPhone(open.customer.id)}{guestDiscount(open.customer) ? ` · ${guestDiscount(open.customer)}% guest discount` : ""}</span></span>
            </DialogTitle>
            <CustomerDetail key={open.customer.id} customer={open.customer} stats={open.stats} orders={orders} loyaltyOn={loyaltyPct > 0} onClose={() => setOpenId(null)} />
          </> : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

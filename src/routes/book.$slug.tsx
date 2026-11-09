import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookingAvailability, bookingStatus, requestBooking } from "@/lib/reservations.functions";
import { BOOKING_MAX_PARTY, bookingRequestError, bookingStatusText } from "@/lib/reservations";
import cover from "@/assets/photography/bistro-menu.jpg";

/**
 * Public table booking: a party, a time and contact details. Guests never see tables or whether
 * they are busy; staff allot the table when they confirm (Bookings → Table bookings).
 */
const openOptions = (slug: string) => queryOptions({ queryKey: ["booking-open", slug], queryFn: () => bookingAvailability({ data: { slug, arrival: new Date(Date.now() + 3600_000).toISOString(), hours: 2 } }), staleTime: 60_000 });
export const Route = createFileRoute("/book/$slug")({
  loader: async ({ params, context }) => {
    try { return { open: await context.queryClient.ensureQueryData(openOptions(params.slug)) }; } catch { return { open: null }; }
  },
  head: () => ({
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Staatliches&display=swap" },
    ],
    meta: [{ title: "Book a table — TAB Bistro by XTSY" }, { name: "description", content: "Book a table for up to 15 guests. We confirm and keep a table for you." }, { name: "robots", content: "noindex" }, { property: "og:title", content: "Book a table — TAB Bistro by XTSY" }, { property: "og:description", content: "Book a table for up to 15 guests." }, { property: "og:type", content: "website" }],
  }),
  component: BookingPage,
});

function localDateTime(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
/** Next half hour, at least an hour from now. */
function defaultArrival() { const d = new Date(Date.now() + 3600_000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d.toISOString(); }

interface Draft { arrival: string; hours: number; name: string; phone: string; party: number; note: string; request: { fingerprint: string; id: string } | null }

function BookingPage() {
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData();
  useEffect(() => { const root = document.documentElement; root.classList.add("theme-xtsy"); return () => root.classList.remove("theme-xtsy"); }, []);
  const [arrival, setArrival] = useState(defaultArrival);
  const [ready, setReady] = useState(false);
  const [hours, setHours] = useState(2);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [party, setParty] = useState(2); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; token: string } | null>(null);
  const request = useRef<Draft["request"]>(null);
  const send = useServerFn(requestBooking);
  const open = useQuery({ ...openOptions(slug), ...(initial.open ? { initialData: initial.open } : {}) });
  const status = useQuery({ queryKey: ["reservation-status", receipt?.id], enabled: !!receipt, queryFn: () => (receipt ? bookingStatus({ data: receipt }) : null), refetchInterval: 5000 });
  useEffect(() => {
    try { const raw = sessionStorage.getItem(`booking:${slug}`); if (raw) setReceipt(JSON.parse(raw) as { id: string; token: string }); } catch { /* no saved booking */ }
    try {
      const raw = sessionStorage.getItem(`booking-draft:${slug}`);
      if (raw) { const d = JSON.parse(raw) as Draft; if (Date.parse(d.arrival) > Date.now()) setArrival(d.arrival); setHours(d.hours); setName(d.name); setPhone(d.phone); setParty(d.party); setNote(d.note ?? ""); request.current = d.request; }
    } catch { /* an invalid saved draft is ignored */ }
    setReady(true);
  }, [slug]);
  useEffect(() => {
    if (!ready || receipt) return;
    try { sessionStorage.setItem(`booking-draft:${slug}`, JSON.stringify({ arrival, hours, name, phone, party, note, request: request.current } satisfies Draft)); } catch { /* private mode keeps the draft in memory */ }
  }, [ready, receipt, slug, arrival, hours, name, phone, party, note]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    const issue = bookingRequestError(Date.parse(arrival), hours, party, Date.now()); if (issue) { setError(issue); return; }
    // The same details resend the same request, so a retry after a lost reply never books twice.
    const fingerprint = JSON.stringify({ name, phone, party, arrival, hours, note });
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await send({ data: { slug, request: request.current.id, name, phone, party, arrival, hours, note } });
      setReceipt(result);
      try { sessionStorage.setItem(`booking:${slug}`, JSON.stringify({ id: result.id, token: result.token })); sessionStorage.removeItem(`booking-draft:${slug}`); } catch { /* keep confirmation in memory */ }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send your booking. Try again without changing it."); }
    finally { setBusy(false); }
  };

  const view = status.data ? bookingStatusText(status.data) : null;
  return <main className="min-h-screen bg-background text-foreground">
    <header className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
      <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/75 to-sidebar/35" />
      <div className="relative mx-auto max-w-xl px-5 pb-8 pt-8">
        <Link to="/order/$slug" params={{ slug }} className="mb-6 inline-flex items-center gap-2 text-sm"><ArrowLeft className="size-4" />Back</Link>
        <p className="xt-eyebrow text-[#e07a8b]">Book a table</p>
        <h1 className="mt-1 text-[2.4rem] text-sidebar-foreground">{open.data?.name ?? "TAB Bistro by XTSY"}</h1>
        <p className="mt-2 text-sm text-sidebar-foreground/85">Up to {BOOKING_MAX_PARTY} guests. Tell us when you're coming; we'll confirm and keep a table for you.</p>
      </div>
      <p className="xt-eyebrow relative bg-primary px-5 py-1.5 text-center text-[0.7rem] text-primary-foreground">Travel. Sleep. Binge. Work. Explore. Repeat.</p>
    </header>
    <div className="mx-auto max-w-xl px-5 py-6">
      {receipt ? <section className="py-4" aria-live="polite">
        <CheckCircle2 className="mb-4 size-10 text-success" />
        <h2 className="text-2xl">{view?.title ?? "Request received"}</h2>
        <p className="mt-2 text-muted-foreground">{view?.body ?? "Checking your booking…"}</p>
        {status.data ? <p className="mt-3 text-sm font-semibold">{new Date(status.data.arrival_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {status.data.party_size} {status.data.party_size === 1 ? "guest" : "guests"}</p> : null}
        {status.isError ? <p role="alert" className="mt-3 text-destructive">Couldn't check the status. Your request is saved.</p> : null}
        <Button className="mt-6" variant="outline" onClick={() => { setReceipt(null); request.current = null; try { sessionStorage.removeItem(`booking:${slug}`); } catch { /* nothing saved */ } }}>Make another booking</Button>
      </section> : open.data && !open.data.enabled ? <p className="py-6 text-muted-foreground">Table booking is closed right now. Please call the restaurant.</p> : <form onSubmit={(e) => void submit(e)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">When
            <input aria-label="Arrival date and time" type="datetime-local" required value={ready ? localDateTime(arrival) : arrival.slice(0, 16)} disabled={busy || !ready}
              onChange={(e) => { const d = new Date(e.target.value); if (Number.isFinite(d.getTime())) setArrival(d.toISOString()); }} className="mt-2 w-full rounded-xl border border-input bg-card p-3" />
          </label>
          <label className="text-sm font-semibold">For how long
            <select aria-label="Duration" value={hours} disabled={busy} onChange={(e) => setHours(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-input bg-card p-3">
              {[1, 2, 3, 4, 6].map((h) => <option key={h} value={h}>{h} {h === 1 ? "hour" : "hours"}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold">Guests
          <select aria-label="Number of guests" value={party} disabled={busy} onChange={(e) => setParty(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-input bg-card p-3">
            {Array.from({ length: BOOKING_MAX_PARTY }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">More than {BOOKING_MAX_PARTY}? Please call us and we'll plan it with you.</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Your name<input aria-label="Your name" required minLength={2} maxLength={80} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-input bg-card p-3" /></label>
          <label className="text-sm font-semibold">Mobile number<input aria-label="Mobile number" required type="tel" inputMode="tel" pattern="[0-9]{10,13}" maxLength={13} value={phone} disabled={busy} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel" className="mt-2 w-full rounded-xl border border-input bg-card p-3" /></label>
        </div>
        <label className="block text-sm font-semibold">Anything we should know? (optional)
          <textarea value={note} maxLength={240} rows={2} disabled={busy} onChange={(e) => setNote(e.target.value)} placeholder="Birthday, high chair, near the bonfire…" className="mt-2 w-full rounded-xl border border-input bg-card p-3 text-sm font-normal" />
        </label>
        {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !ready || open.isError}><CalendarClock />{busy ? "Sending…" : "Request booking"}</Button>
        <p className="text-center text-xs text-muted-foreground">We'll confirm by phone or WhatsApp. Your table is held once it's confirmed.</p>
      </form>}
    </div>
  </main>;
}

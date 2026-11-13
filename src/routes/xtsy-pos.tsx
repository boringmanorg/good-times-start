import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarCheck, Gift, Check, ChefHat, ClipboardList, FileSpreadsheet, KeyRound, LayoutDashboard, MessageCircle, Printer,
  QrCode, Receipt, Send, ShieldCheck, ShoppingBasket, Smartphone, Store, Tablet, Users, WifiOff, X, Play,
} from "lucide-react";
import { FEATURE_NAMES, PUBLIC_FEATURES, PUBLIC_PLANS, SEAT_NAMES, priceText, seatText, whatsappLink, type SeatApp } from "@/lib/plans";
import { FAQ, PRICE_RANGE, SITE_DESCRIPTION, SITE_TITLE, enquiryMessage, enquiryProblem, type Enquiry } from "@/lib/site-content";
import { siteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { DemoTour } from "@/components/site/DemoTour";
import logo from "@/assets/logo.png";

/*
 * The XTSY POS website. Showcase only: no sign-in, no payments, no database.
 * Enquiries become a WhatsApp message to XTSY and a copy stays on the visitor's own device.
 */
export const Route = createFileRoute("/xtsy-pos")({
  head: () => {
    const url = siteUrl();
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "XTSY", url: "https://xtsy.one", logo: `${url.replace(/\/xtsy-pos$/, "")}/brand/xtsy-logo.png` },
        { "@type": "SoftwareApplication", name: "XTSY POS", alternateName: "POS by XTSY", applicationCategory: "BusinessApplication", applicationSubCategory: "Restaurant POS",
          operatingSystem: "Web, Windows, macOS, Android, iOS", description: SITE_DESCRIPTION, url,
          offers: { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: PRICE_RANGE.low, highPrice: PRICE_RANGE.high, offerCount: PUBLIC_PLANS.length } },
        { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      ],
    };
    return {
      meta: [
        { title: SITE_TITLE },
        { name: "description", content: SITE_DESCRIPTION },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: SITE_TITLE },
        { property: "og:description", content: SITE_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: `${url.replace(/\/xtsy-pos$/, "").replace(/\/$/, "")}/og-xtsy-pos.png` },
        { property: "og:site_name", content: "XTSY POS" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "theme-color", content: "#000000" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
    };
  },
  component: SitePage,
});

const NAV = [{ href: "#apps", l: "Apps" }, { href: "#features", l: "Features" }, { href: "#pricing", l: "Pricing" }, { href: "#faq", l: "FAQ" }];

function SitePage() {
  const [plan, setPlan] = useState("");
  const [demo, setDemo] = useState(false);
  const pick = (name: string) => { setPlan(name); document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" }); };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass-dark sticky top-0 z-30 border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2.5" aria-label="XTSY POS home">
            <img src={logo} alt="" width={34} height={34} className="rounded-[9px]" />
            <span><span className="font-brand block text-[22px] leading-none">XTSY POS</span><span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">POS by XTSY</span></span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex" aria-label="Website">
            {NAV.map((n) => <a key={n.href} href={n.href} className="hover:text-foreground">{n.l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDemo(true)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/60 px-4 py-2 text-sm font-bold text-primary hover:bg-primary-tint"><Play className="size-3.5 fill-current" />Demo</button>
            <a href="#enquire" className="hidden rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-hover min-[400px]:inline-block">Get started</a>
          </div>
        </div>
      </header>
      {demo ? <DemoTour onClose={() => setDemo(false)} /> : null}

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_10%,color-mix(in_srgb,var(--color-primary)_22%,transparent),transparent_70%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Restaurant billing software · India & Asia</p>
              <h1 className="mt-3 text-[2.9rem] leading-[0.98] sm:text-6xl lg:text-7xl">Restaurant billing software, made to be loved.</h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">Billing, KOTs, QR ordering, guest loyalty and a waiter app, live on every device and still working when the internet isn't. Built in Shillong for restaurants, fine dine, cafés and cloud kitchens.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#pricing" className="rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary-hover">See plans from ₹{PRICE_RANGE.low}/month</a>
                <button type="button" onClick={() => setDemo(true)} className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 font-bold hover:bg-secondary"><Play className="size-4 fill-current text-primary" />Watch the demo</button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["Works offline", "GST billing", "58 & 80 mm printers", "Live sync across devices"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-primary" />{t}</li>)}
              </ul>
            </div>
            <HeroMock />
          </div>
        </section>

        <section aria-label="First onboarded restaurant" className="border-y border-border bg-card/60">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-center text-sm sm:flex-row sm:text-left">
            <p><span className="font-semibold">Running live at TAB Bistro by XTSY</span><span className="text-muted-foreground">, our first restaurant cum hotel in New Shillong, Meghalaya.</span></p>
            <p className="text-muted-foreground">Dine-in · rooms · takeaway · delivery</p>
          </div>
        </section>

        {/* Apps */}
        <Section id="apps" eyebrow="Three apps, one restaurant" title="Every screen your team needs">
          <div className="grid gap-4 md:grid-cols-3">
            <AppCard icon={LayoutDashboard} name="POS Manager" who="Owner and managers · phone, tablet, computer"
              points={["Live sales, running bills and dashboard", "Menu, prices, purchases and approvals", "Staff logins, roles and every device"]} />
            <AppCard icon={Store} name="POS Billdesk" who="Reception counter · Windows or Mac"
              points={["Tables, takeaway, delivery and room bills", "KOTs to each kitchen station", "Cash, UPI, card and split payments"]} />
            <AppCard icon={Tablet} name="Waiter Pro" who="Waiters · Android phone or tablet" badge="Pro & Enterprise"
              points={["Take orders at the table", "Send KOTs without walking to the counter", "See which tables wait for their bill"]} />
          </div>
        </Section>

        {/* Features */}
        <Section id="features" eyebrow="Built for real service" title="Everything a busy restaurant runs on">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={WifiOff} title="Offline-first billing">Bills are saved on the counter first. The internet can drop mid-service; billing doesn't.</Feature>
            <Feature icon={ChefHat} title="KOTs that kitchens can read">Quantity first, one ticket per station, and slips that fit 58 mm and 80 mm thermal printers.</Feature>
            <Feature icon={QrCode} title="Guest QR ordering">Dine-in, takeaway and delivery from one public QR, plus in-room dining QRs where the restaurant serves a stay.</Feature>
            <Feature icon={Gift} title="Guest loyalty">Guests earn points back on every bill and spend them on their next visit.</Feature>
            <Feature icon={CalendarCheck} title="Table bookings">Guests book for their party; your team allots the table and confirms.</Feature>
            <Feature icon={ShoppingBasket} title="Purchases with approval">The bill desk records supplier bills; the owner checks and approves them.</Feature>
            <Feature icon={Receipt} title="GST billing">GSTIN on every bill, CGST and SGST per dish, round-off and NC bills done right.</Feature>
            <Feature icon={FileSpreadsheet} title="Sales summary and Excel">Day, week and month sales by payment, item and staff, ready for your accountant.</Feature>
            <Feature icon={ShieldCheck} title="Audit log and device control">Who changed what, on which device. Block or release any terminal in seconds.</Feature>
            <Feature icon={KeyRound} title="60-second admin code">Discounts, voids and reprints can need a code that changes every minute, with no internet needed.</Feature>
            <Feature icon={MessageCircle} title="WhatsApp marketing">Offers and thank-you messages to guests who agreed to hear from you.</Feature>
            <Feature icon={Printer} title="Prints from any device">Waiters send prints to the counter printer; the counter prints silently.</Feature>
          </div>
        </Section>

        {/* POS by XTSY models */}
        <Section id="for" eyebrow="POS by XTSY" title="One XTSY brand, an app for every kind of hospitality">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-success"><span className="size-2 rounded-full bg-success" aria-hidden="true" />Live now</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                {["Restaurants", "Fine dine", "Cafés", "Cloud kitchens"].map((t) => (
                  <div key={t} className="rounded-2xl bg-secondary px-3 py-5 font-semibold">{t}</div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-dashed border-primary/50 bg-primary-tint/40 p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary"><span className="size-2 rounded-full bg-primary" aria-hidden="true" />Coming soon</p>
              <ul className="mt-4 space-y-3">
                <li className="rounded-2xl bg-card px-4 py-3"><p className="font-semibold">POS by XTSY for Hotels & Resorts</p><p className="text-sm text-muted-foreground">Rooms, stays, in-room dining and the front desk.</p></li>
                <li className="rounded-2xl bg-card px-4 py-3"><p className="font-semibold">POS by XTSY for Tourism</p><p className="text-sm text-muted-foreground">Tours, travel desks and experiences.</p></li>
              </ul>
            </div>
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-muted-foreground">Separate apps for each part of hospitality and tourism, all under one XTSY brand.</p>
        </Section>

        {/* Pricing */}
        <Section id="pricing" eyebrow="Simple monthly plans, per outlet" title="Pricing">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PUBLIC_PLANS.map((p) => (
              <article key={p.id} className={cn("relative flex flex-col rounded-3xl border p-6", p.highlight ? "border-primary bg-primary-tint" : "border-border bg-card")}>
                {p.highlight ? <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Most popular</span> : null}
                <h3 className="font-brand text-3xl">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <p className="mt-5"><span className="text-4xl font-extrabold tabular-nums">{p.price === null ? "Custom" : `₹${p.price}`}</span>{p.price === null ? null : <span className="text-muted-foreground"> / month per outlet</span>}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {(["pos", "manager", "waiter"] as SeatApp[]).map((a) => (
                    <li key={a} className={cn("flex gap-2 font-semibold", p.seats[a] === 0 && "font-normal text-muted-foreground")}>
                      {p.seats[a] === 0 ? <X className="mt-0.5 size-4 shrink-0 opacity-50" /> : <Users className="mt-0.5 size-4 shrink-0 text-primary" />}{seatText(a, p.seats[a])}
                    </li>
                  ))}
                </ul>
                <ul className="mt-4 flex-1 space-y-2 border-t border-border pt-4 text-sm">
                  {PUBLIC_FEATURES.map((f) => {
                    const on = p.features.includes(f);
                    return (
                      <li key={f} className={cn("flex gap-2", !on && "text-muted-foreground/70")}>
                        {on ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : <X className="mt-0.5 size-4 shrink-0 opacity-50" />}
                        <span>{FEATURE_NAMES[f]}{!on ? <span className="sr-only"> (not included)</span> : null}</span>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => pick(p.name)}
                  className={cn("mt-6 rounded-full px-5 py-3 font-bold", p.highlight ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border hover:bg-secondary")}>
                  {p.price === null ? "Call for quote" : `Choose ${p.name}`}
                </button>
              </article>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">Prices are per outlet per month. Users are devices signed in to each app: {Object.values(SEAT_NAMES).join(", ")}. No payment is taken on this website; we set you up after your enquiry.</p>
        </Section>

        {/* Enquiry */}
        <Section id="enquire" eyebrow="Tell us what you need" title="Start with XTSY POS">
          <EnquiryForm plan={plan} setPlan={setPlan} />
        </Section>

        {/* FAQ */}
        <Section id="faq" eyebrow="Questions" title="Frequently asked">
          <div className="mx-auto max-w-3xl divide-y divide-border rounded-3xl border border-border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold"><h3 className="text-base">{f.q}</h3><span className="text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
                <p className="mt-2 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <p><span className="font-brand text-lg text-foreground">XTSY POS</span> · POS by XTSY · © {new Date().getFullYear()} XTSY Ventures Private Limited</p>
          <p className="text-base text-foreground">Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by <a href="https://xtsy.one" target="_blank" rel="noreferrer" className="font-semibold hover:text-primary">XTSY</a></p>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-14 md:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h2 className="font-brand mt-2 text-center text-4xl md:text-5xl">{title}</h2>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function AppCard({ icon: Icon, name, who, points, badge }: { icon: typeof Store; name: string; who: string; points: string[]; badge?: string }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-primary-tint text-primary"><Icon className="size-6" /></span>
        {badge ? <span className="rounded-full border border-primary/50 px-2.5 py-1 text-[11px] font-bold text-primary">{badge}</span> : null}</div>
      <h3 className="font-brand mt-4 text-3xl">{name}</h3>
      <p className="text-sm text-muted-foreground">{who}</p>
      <ul className="mt-4 space-y-2 text-sm">{points.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{p}</li>)}</ul>
    </article>
  );
}

function Feature({ icon: Icon, title, children }: { icon: typeof Store; title: string; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <Icon className="size-6 text-primary" />
      <h3 className="mt-3 text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </article>
  );
}

/** A drawn (not screenshotted) preview of the counter and waiter apps. */
function HeroMock() {
  const tiles = [
    { l: "D1", s: "₹1,240 · 45 min", tone: "border-primary bg-primary/15" },
    { l: "D2", s: "Bill ready", tone: "border-gold bg-gold/15" },
    { l: "Hut 1", s: "Free", tone: "border-border bg-secondary" },
    { l: "Room 7A", s: "₹380 · room bill", tone: "border-primary bg-primary/15" },
    { l: "Family", s: "Booked 8 pm", tone: "border-border bg-secondary" },
    { l: "Bonfire", s: "Free", tone: "border-border bg-secondary" },
  ];
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-lg">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-[0_30px_80px_-30px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2"><img src={logo} alt="" width={22} height={22} className="rounded-md" /><span className="font-brand text-lg">POS Billdesk</span></div>
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">Live</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {tiles.map((t) => <div key={t.l} className={cn("rounded-xl border-2 p-3", t.tone)}><p className="font-bold">{t.l}</p><p className="text-[11px] text-muted-foreground">{t.s}</p></div>)}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary p-3 text-sm">
          <span className="flex items-center gap-2"><ClipboardList className="size-4 text-primary" />KOT/0072 sent to Kitchen</span><span className="font-bold">4 x Tawa Roti</span>
        </div>
      </div>
      <div className="absolute -bottom-10 -right-2 w-40 rounded-[1.6rem] border border-border bg-card p-3 shadow-2xl sm:-right-8">
        <div className="flex items-center gap-1.5 text-xs font-semibold"><Smartphone className="size-3.5 text-primary" />Waiter Pro</div>
        <div className="mt-2 space-y-1.5">
          {["Paneer Tikka x2", "Masala Chai x4", "Butter Naan x3"].map((l) => <p key={l} className="rounded-lg bg-secondary px-2 py-1.5 text-[11px]">{l}</p>)}
        </div>
        <p className="mt-2 rounded-lg bg-primary py-1.5 text-center text-[11px] font-bold text-primary-foreground">Send KOT</p>
      </div>
    </div>
  );
}

const BLANK: Enquiry = { name: "", business: "", city: "", phone: "", outlets: "1", plan: "", message: "" };
const SAVED = "xtsy-pos-enquiry";

function EnquiryForm({ plan, setPlan }: { plan: string; setPlan: (p: string) => void }) {
  const [form, setForm] = useState<Enquiry>(() => {
    if (typeof window === "undefined") return BLANK;
    try { const raw = window.localStorage.getItem(SAVED); return raw ? { ...BLANK, ...(JSON.parse(raw) as Partial<Enquiry>), message: "" } : BLANK; } catch { return BLANK; }
  });
  const [problem, setProblem] = useState("");
  const [sentTo, setSentTo] = useState("");
  const value = { ...form, plan: plan || form.plan };
  const set = (k: keyof Enquiry) => (e: { target: { value: string } }) => { if (k === "plan") setPlan(e.target.value); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = enquiryProblem(value);
    setProblem(p ?? "");
    if (p) return;
    // No database: the details stay on this device (to prefill next time) and go to XTSY on WhatsApp.
    try { window.localStorage.setItem(SAVED, JSON.stringify(value)); } catch { /* private mode */ }
    const link = whatsappLink(enquiryMessage(value));
    setSentTo(link);
    window.location.assign(link);
  };
  const input = "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base";
  return (
    <form onSubmit={submit} className="mx-auto grid max-w-3xl gap-4 rounded-3xl border border-border bg-card p-6 sm:grid-cols-2 md:p-8" noValidate>
      <label className="text-sm font-medium">Your name *<input autoComplete="name" value={value.name} onChange={set("name")} className={input} /></label>
      <label className="text-sm font-medium">Restaurant / brand *<input autoComplete="organization" value={value.business} onChange={set("business")} className={input} /></label>
      <label className="text-sm font-medium">City *<input autoComplete="address-level2" value={value.city} onChange={set("city")} className={input} /></label>
      <label className="text-sm font-medium">Mobile (WhatsApp) *<input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={value.phone} onChange={set("phone")} className={input} /></label>
      <label className="text-sm font-medium">Outlets
        <select value={value.outlets} onChange={set("outlets")} className={input}><option>1</option><option>2–5</option><option>6–20</option><option>More than 20</option></select>
      </label>
      <label className="text-sm font-medium">Plan
        <select value={value.plan} onChange={set("plan")} className={input}><option value="">Help me choose</option>{PUBLIC_PLANS.map((p) => <option key={p.id} value={p.name}>{p.name} · {priceText(p.price)}</option>)}</select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">Your requirement
        <textarea rows={4} maxLength={800} value={value.message} onChange={set("message")} placeholder="Tables, rooms, counters, waiters, printers, anything special…" className={input} />
      </label>
      {problem ? <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">{problem}</p> : null}
      <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Sends your details to XTSY on WhatsApp. Nothing is stored on our servers.</p>
        <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary-hover"><Send className="size-4" />Send on WhatsApp</button>
      </div>
      {sentTo ? <p className="text-sm sm:col-span-2">WhatsApp didn't open? <a href={sentTo} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Tap here to send your enquiry</a>.</p> : null}
    </form>
  );
}

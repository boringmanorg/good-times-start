import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Play, Send, X } from "lucide-react";
import { FEATURE_NAMES, PUBLIC_FEATURES, PUBLIC_PLANS, SEAT_NAMES, priceText, whatsappLink, type PublicPlan, type SeatApp } from "@/lib/plans";
import { DEMOS, STATUS, SITE_DESCRIPTION, SITE_TITLE, enquiryMessage, enquiryProblem, faqFor, type Enquiry } from "@/lib/site-content";
import { loadPublicPlans, priceRange } from "@/lib/public-plans";
import { siteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { DemoVideo } from "@/components/site/DemoVideo";
import logo from "@/assets/logo.png";

/*
 * The XTSY POS website. Showcase only: no sign-in, no payments, no database writes.
 * Enquiries become a WhatsApp message to XTSY and a copy stays on the visitor's own device.
 */
export const Route = createFileRoute("/xtsy-pos")({
  // Prices come from the plans catalogue, not a second copy in the code: the console is where
  // they are changed, and a stale price list on the home page is worse than a slow one.
  loader: async () => ({ plans: await loadPublicPlans() }),
  head: ({ loaderData }) => {
    const url = siteUrl();
    // Before the loader has run (a head-only render), fall back to the compiled list.
    const range = priceRange(loaderData?.plans ?? PUBLIC_PLANS);
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "XTSY", url: "https://xtsy.one", logo: `${url.replace(/\/xtsy-pos$/, "")}/brand/xtsy-logo.png` },
        { "@type": "SoftwareApplication", name: "XTSY POS", alternateName: "POS by XTSY", applicationCategory: "BusinessApplication", applicationSubCategory: "Restaurant POS",
          operatingSystem: "Web, Windows, macOS, Android, iOS", description: SITE_DESCRIPTION, url,
          offers: { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: range.low, highPrice: range.high, offerCount: range.count } },
        { "@type": "FAQPage", mainEntity: faqFor(loaderData?.plans ?? PUBLIC_PLANS).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
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


const NAV = [{ href: "#demos", l: "Demos" }, { href: "#status", l: "What's live" }, { href: "#pricing", l: "Pricing" }, { href: "#faq", l: "Questions" }];

function SitePage() {
  const { plans } = Route.useLoaderData();
  const range = priceRange(plans);
  const faq = faqFor(plans);
  const [plan, setPlan] = useState("");
  const pick = (name: string) => { setPlan(name); document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" }); };
  return (
    <div className="min-h-screen bg-black text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2.5" aria-label="XTSY POS home">
            <img src={logo} alt="" width={34} height={34} className="rounded-[9px]" />
            <span className="font-brand text-[24px] leading-none">XTSY POS</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex" aria-label="Website">
            {NAV.map((n) => <a key={n.href} href={n.href} className="hover:text-foreground">{n.l}</a>)}
          </nav>
          <a href="#enquire" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-hover">Talk to us</a>
        </div>
      </header>

      <main id="top">
        {/* Hero: the product itself, running. */}
        <section className="px-4 pb-14 pt-10 md:pb-20 md:pt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
            <div>
              <h1 className="font-brand text-[3.4rem] leading-[0.9] sm:text-7xl lg:text-[5.4rem]">Bill the table. Send the KOT. See every rupee.</h1>
              <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
                XTSY POS runs the counter, the waiters' phones, guest QR orders and the owner's books. Every device stays in step live, and the counter keeps billing when the internet drops.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#demos" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground hover:bg-primary-hover"><Play className="size-4 fill-current" />Watch the demos</a>
                <a href="#pricing" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-6 font-bold hover:bg-white/5">Plans from ₹{range.low} a month</a>
              </div>
              <p className="mt-8 max-w-[34rem] text-sm text-muted-foreground">
                Running every day at <Link to="/tab-bistro" className="font-semibold text-foreground underline decoration-primary/60 underline-offset-4 hover:decoration-primary">TAB Bistro by XTSY</Link>, a restaurant and stay in New Shillong, Meghalaya. Made in Tamil Nadu for restaurants across India and Asia.
              </p>
            </div>
            <div>
              <DemoVideo id="billing" title="Bill a table on POS Billdesk" eager />
              <p className="mt-3 text-sm text-muted-foreground">POS Billdesk, billing table D1 with TAB Bistro's menu. Recorded on the real app.</p>
            </div>
          </div>
        </section>

        <section aria-label="In short" className="border-y border-white/10 px-4 py-6">
          <ul className="mx-auto grid max-w-6xl gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {["No commission on orders from your own QR", "Keeps billing when the internet drops", "UPI, card, cash and GST-ready bills", "Counter, waiters and owner in sync live"].map((t) => (
              <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>
            ))}
          </ul>
        </section>

        <Section id="demos" title="Watch it work" intro="Real screens from XTSY POS, recorded with TAB Bistro's menu. The owner's screens use sample figures, marked Demo data.">
          <DemoTheatre />
        </Section>

        <Section id="status" title="Where XTSY POS stands today" intro="Updated November 2026. Live means restaurants use it now; nothing below is sold before it works.">
          <StatusBoard />
        </Section>

        <Section id="brand" title="Your guests, not the aggregator's" intro="Keep Swiggy and Zomato for discovery if they work for you. Orders from your own QR cost you nothing per order, and the guest stays yours.">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Aggregators take roughly 18–30% of every order, plus GST on that commission, and you never get the guest's number. Here is the same month two ways:</p>
              <dl className="mt-6 divide-y divide-white/10 border-y border-white/10">
                {[["Delivery sales in a month", "₹5,00,000", ""], ["Gone at 25% commission", "− ₹1,25,000", "text-destructive"], ["Kept if 30% came through your own QR", "₹37,500", "text-success"]].map(([l, v, tone]) => (
                  <div key={l} className="flex items-baseline justify-between gap-4 py-3.5"><dt className="text-sm text-muted-foreground">{l}</dt><dd className={cn("whitespace-nowrap text-xl font-bold tabular-nums", tone)}>{v}</dd></div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Put in your own sales and commission; the arithmetic is the same.</p>
            </div>
            <ul className="space-y-5">
              {[
                ["The guest list is yours", "Name, mobile, visits and favourite dishes build up from every bill. It leaves with you if you ever leave."],
                ["Bring them back on WhatsApp", "Send an offer to guests who agreed to hear from you, picked by how recently or how often they come."],
                ["Points on every bill", "Guests earn a percentage back and spend it on their next visit. No cards, no app."],
                ["Your name on everything", "Your logo and colours on the ordering page, the QR card and the printed bill."],
              ].map(([t, d]) => (
                <li key={t} className="border-l-2 border-primary pl-4"><p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted-foreground">{d}</p></li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="pricing" title="Prices, per outlet per month" intro="Each plan adds to the one before it. No payment is taken on this website: send an enquiry and the XTSY team sets you up.">
          <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p, i) => <PlanBill key={p.id} plan={p} before={plans[i - 1]} onPick={() => pick(p.name)} />)}
          </div>
          <PlanComparison plans={plans} />
          <p className="mt-5 text-sm text-muted-foreground">Users are devices signed in to each app: {Object.values(SEAT_NAMES).join(", ")}. Support runs every day of the week, weekends included, except national holidays.</p>
        </Section>

        <Section id="enquire" title="Start with XTSY POS" intro="Tell us about your restaurant. Your enquiry opens in WhatsApp, addressed to the XTSY team.">
          <EnquiryForm plan={plan} setPlan={setPlan} plans={plans} />
        </Section>

        <Section id="faq" title="Questions">
          <div className="max-w-3xl divide-y divide-white/10 border-y border-white/10">
            {faq.map((f) => (
              <details key={f.q} className="group py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold"><h3 className="text-base">{f.q}</h3><span className="text-xl text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
                <p className="mt-2 max-w-[65ch] text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** The six recorded demos: pick one on the left (a row of chips on phones), watch it on the right. */
function DemoTheatre() {
  // The hero already plays billing, so the theatre opens on the next one.
  const [active, setActive] = useState(DEMOS[1]!.id);
  const demo = DEMOS.find((d) => d.id === active) ?? DEMOS[0]!;
  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:gap-10">
      <div role="group" aria-label="Choose a demo" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
        {DEMOS.map((d) => {
          const on = d.id === active;
          return (
            <button key={d.id} type="button" aria-pressed={on} onClick={() => setActive(d.id)}
              className={cn("shrink-0 rounded-full border px-4 py-2 text-left text-sm font-semibold lg:block lg:w-full lg:rounded-none lg:border-0 lg:border-l-2 lg:px-4 lg:py-3",
                on ? "border-primary bg-primary text-primary-foreground lg:bg-white/[0.04] lg:text-foreground" : "border-white/15 text-muted-foreground hover:text-foreground lg:border-white/10")}>
              <span className="block">{d.title}</span>
              <span className={cn("hidden text-xs font-normal lg:block", on ? "text-primary" : "text-muted-foreground")}>{d.app}</span>
              {on ? <span className="mt-2 hidden text-sm font-normal leading-relaxed text-muted-foreground lg:block">{d.text}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="rounded-2xl bg-[#141416] p-3 sm:p-6">
        <div className={cn(demo.device === "phone" && "mx-auto max-w-[300px]")}>
          <DemoVideo key={demo.id} id={demo.id} title={demo.title} phone={demo.device === "phone"} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground lg:hidden"><span className="font-semibold text-foreground">{demo.app}.</span> {demo.text}</p>
      </div>
    </div>
  );
}

function StatusBoard() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr]">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full bg-success" aria-hidden="true" />Live now</h3>
        <ul className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {STATUS.live.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full bg-gold" aria-hidden="true" />Being tested</h3>
        <ul className="mt-4 space-y-4">
          {STATUS.testing.map((t) => <li key={t.name} className="border-l-2 border-gold pl-3"><p className="text-sm font-semibold">{t.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{t.note}</p></li>)}
        </ul>
      </div>
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full bg-[#c0335a]" aria-hidden="true" />Coming next</h3>
        <ul className="mt-4 space-y-4">
          {STATUS.next.map((t) => <li key={t.name} className="border-l-2 border-[#c0335a] pl-3"><p className="text-sm font-semibold">{t.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{t.note}</p></li>)}
        </ul>
      </div>
    </div>
  );
}

/** A plan printed as a thermal bill: seats, what it adds, and the monthly total. */
function PlanBill({ plan: p, before, onPick }: { plan: PublicPlan; before?: PublicPlan | undefined; onPick: () => void }) {
  const adds = PUBLIC_FEATURES.filter((f) => p.features.includes(f) && !before?.features.includes(f));
  const rule = <div className="my-3 border-t border-dashed border-black/35" aria-hidden="true" />;
  return (
    <article className={cn("relative", p.highlight && "lg:-mt-4")}>
      <div className="bg-[#faf9f5] px-5 pb-6 pt-5 text-[#1b1b1b] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]" style={{ fontFamily: '"Courier New", ui-monospace, monospace' }}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs">XTSY POS</p>
          {p.highlight ? <p className="-rotate-3 rounded border-2 border-[#a12444] px-1.5 text-[11px] font-bold text-[#a12444]">RECOMMENDED</p> : null}
        </div>
        <h3 className="font-brand mt-1 text-[2rem] leading-none" style={{ fontFamily: "var(--font-brand)" }}>{p.name}</h3>
        <p className="mt-1.5 text-xs leading-snug">{p.tagline}</p>
        {rule}
        <dl className="space-y-1 text-[13px]">
          {(["pos", "manager", "waiter"] as SeatApp[]).map((a) => (
            <div key={a} className="flex justify-between gap-2"><dt>{SEAT_NAMES[a]} users</dt><dd className="tabular-nums">{p.seats[a] === null ? "Unlimited" : p.seats[a] === 0 ? "—" : p.seats[a]}</dd></div>
          ))}
        </dl>
        {rule}
        <p className="text-[13px]">{before ? `Everything on ${before.name}, plus:` : "Includes:"}</p>
        <ul className="mt-1.5 space-y-1 text-[13px]">
          {adds.map((f) => <li key={f}>{FEATURE_NAMES[f]}</li>)}
        </ul>
        {rule}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold">TOTAL</span>
          <span className="text-[1.9rem] font-bold leading-none tabular-nums">{p.price === null ? "Quote" : `₹${p.price}`}</span>
        </div>
        <p className="mt-1 text-right text-xs">{p.price === null ? "call us" : "a month, per outlet"}</p>
        <button type="button" onClick={onPick}
          className={cn("mt-5 w-full rounded-full py-3 font-sans text-sm font-bold", p.highlight ? "bg-[#a12444] text-white hover:bg-[#8a1d3a]" : "bg-[#1b1b1b] text-white hover:bg-black")}>
          {p.price === null ? "Call for a quote" : `Choose ${p.name}`}
        </button>
      </div>
      <div aria-hidden="true" className="h-3" style={{ background: "radial-gradient(circle at 7px 0, #faf9f5 6px, transparent 6.5px) 0 0 / 14px 12px repeat-x" }} />
    </article>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p><span className="font-brand text-xl text-foreground">XTSY POS</span> is made by XTSY Ventures Private Limited, New Shillong, Meghalaya.</p>
          <p className="mt-1">Questions about your data or a payment: <a href="mailto:admin@xtsy.one" className="text-foreground underline underline-offset-4">admin@xtsy.one</a></p>
          <nav aria-label="Policies" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms of service</Link>
            <Link to="/refunds" className="hover:text-foreground">Refunds and cancellation</Link>
            <Link to="/tab-bistro" className="hover:text-foreground">TAB Bistro</Link>
          </nav>
        </div>
        <p className="text-base text-foreground">© {new Date().getFullYear()} · Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by <a href="https://xtsy.one" target="_blank" rel="noreferrer" className="font-semibold hover:text-primary">XTSY</a></p>
      </div>
    </footer>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-white/10 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-brand text-[2.6rem] leading-none md:text-6xl">{title}</h2>
        {intro ? <p className="mt-4 max-w-[60ch] text-muted-foreground">{intro}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Every plan beside every feature, so nothing is hidden behind a "contact us". */
function PlanComparison({ plans }: { plans: PublicPlan[] }) {
  const seats: [SeatApp, string][] = [["pos", SEAT_NAMES.pos], ["manager", SEAT_NAMES.manager], ["waiter", SEAT_NAMES.waiter]];
  return (
    <div className="mt-10">
      <p className="mb-2 text-center text-xs text-muted-foreground md:hidden">Swipe the table sideways to compare all four plans.</p>
      <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <caption className="sr-only">XTSY POS plans compared, feature by feature</caption>
        <thead>
          <tr className="bg-card">
            <th scope="col" className="sticky left-0 bg-card p-3 font-semibold">Compare every plan</th>
            {plans.map((p) => (
              <th key={p.id} scope="col" className={cn("p-3 text-center", p.highlight && "bg-primary-tint")}>
                <span className="font-brand block text-xl leading-none">{p.name}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{priceText(p.price)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {seats.map(([app, label]) => (
            <tr key={app}>
              <th scope="row" className="sticky left-0 bg-background p-3 font-medium">{label} users</th>
              {plans.map((p) => {
                const n = p.seats[app];
                return <td key={p.id} className={cn("p-3 text-center tabular-nums", p.highlight && "bg-primary-tint/40", n === 0 && "text-muted-foreground")}>{n === null ? "Unlimited" : n === 0 ? "—" : n}</td>;
              })}
            </tr>
          ))}
          {PUBLIC_FEATURES.map((f) => (
            <tr key={f}>
              <th scope="row" className="sticky left-0 bg-background p-3 font-normal">{FEATURE_NAMES[f]}</th>
              {plans.map((p) => {
                const on = p.features.includes(f);
                return (
                  <td key={p.id} className={cn("p-3 text-center", p.highlight && "bg-primary-tint/40")}>
                    {on ? <Check className="mx-auto size-4 text-primary" aria-label="Included" /> : <X className="mx-auto size-4 text-muted-foreground/40" aria-label="Not included" />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

const BLANK: Enquiry = { name: "", business: "", city: "", phone: "", outlets: "1", plan: "", message: "" };
const SAVED = "xtsy-pos-enquiry";

function EnquiryForm({ plan, setPlan, plans }: { plan: string; setPlan: (p: string) => void; plans: PublicPlan[] }) {
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
    <form onSubmit={submit} className="grid max-w-3xl gap-4 rounded-3xl border border-border bg-card p-6 sm:grid-cols-2 md:p-8" noValidate>
      <label className="text-sm font-medium">Your name *<input autoComplete="name" value={value.name} onChange={set("name")} className={input} /></label>
      <label className="text-sm font-medium">Restaurant / brand *<input autoComplete="organization" value={value.business} onChange={set("business")} className={input} /></label>
      <label className="text-sm font-medium">City *<input autoComplete="address-level2" value={value.city} onChange={set("city")} className={input} /></label>
      <label className="text-sm font-medium">Mobile (WhatsApp) *<input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={value.phone} onChange={set("phone")} className={input} /></label>
      <label className="text-sm font-medium">Outlets
        <select value={value.outlets} onChange={set("outlets")} className={input}><option>1</option><option>2–5</option><option>6–20</option><option>More than 20</option></select>
      </label>
      <label className="text-sm font-medium">Plan
        <select value={value.plan} onChange={set("plan")} className={input}><option value="">Help me choose</option>{plans.map((p) => <option key={p.id} value={p.name}>{p.name} · {priceText(p.price)}</option>)}</select>
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

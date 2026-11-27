import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { DemoVideo } from "@/components/site/DemoVideo";
import { EnquiryForm } from "@/components/site/EnquiryForm";
import { PlanBuilder } from "@/components/site/PlanBuilder";
import { Faq, StatusBoard } from "@/components/site/SiteBlocks";
import { ClosingCta, SiteSection, SiteShell, Ticker } from "@/components/site/SiteChrome";
import { PUBLIC_PLANS } from "@/lib/plans";
import { loadCatalogue, plansByModelFrom, priceRange, publicPlansFrom } from "@/lib/public-plans";
import { SITE_DESCRIPTION, SITE_TITLE, faqFor } from "@/lib/site-content";
import { siteUrl } from "@/lib/site-config";
import { SITE_MODELS, STATUS_LABEL } from "@/lib/site-models";
import { cn } from "@/lib/utils";

/*
 * The XTSY POS home page: a subscription storefront for every POS model, in the xtsy.one look.
 * Showcase only: no sign-in, no payments, no database writes. Each model has its own page.
 */
export const Route = createFileRoute("/xtsy-pos")({
  // Prices come from the plans catalogue, so a price changed in the console shows here at once.
  loader: async () => ({ rows: await loadCatalogue() }),
  head: ({ loaderData }) => {
    const url = siteUrl();
    const restaurant = loaderData?.rows?.length ? publicPlansFrom(loaderData.rows) : PUBLIC_PLANS;
    const range = priceRange(restaurant);
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "XTSY Ventures Private Limited", alternateName: "XTSY", url: "https://xtsy.one", logo: `${url.replace(/\/$/, "")}/brand/xtsy-logo.png`,
          address: { "@type": "PostalAddress", addressLocality: "Coimbatore", addressRegion: "Tamil Nadu", addressCountry: "IN" } },
        { "@type": "SoftwareApplication", name: "XTSY POS", alternateName: "POS by XTSY", applicationCategory: "BusinessApplication",
          operatingSystem: "Web, Windows, macOS, Android, iOS", description: SITE_DESCRIPTION, url,
          offers: { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: range.low, highPrice: range.high, offerCount: range.count } },
        { "@type": "ItemList", name: "XTSY POS models", itemListElement: SITE_MODELS.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.name, url: `${url.replace(/\/$/, "")}${m.path}` })) },
        { "@type": "FAQPage", mainEntity: faqFor(restaurant).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
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
        { property: "og:image", content: `${url.replace(/\/$/, "")}/og-xtsy-pos.png` },
        { property: "og:site_name", content: "XTSY POS" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "theme-color", content: "#1F2230" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
    };
  },
  component: HomePage,
});

const INCLUDED = [
  ["Works when the internet doesn't", "Bills and the desk keep going offline and sync when the connection is back."],
  ["Every device in step", "Counter, phones and the owner's screens update live."],
  ["GST from day one", "GST bills and folios, reports and exports for your accountant."],
  ["Your data is yours", "Export to Excel any time. It leaves with you if you ever leave."],
  ["A person on WhatsApp", "Support every day of the week, weekends included, except national holidays."],
  ["Move plans any time", "Up or down a plan when the season changes; every device follows at once."],
] as const;

const STEPS = [
  ["Pick your model and plan", "Use the plan builder or send us your needs. We'll suggest the plan that fits."],
  ["XTSY sets you up", "Your outlet or property, logins and devices, ready to use. Menus and rooms loaded with you."],
  ["Pay monthly, by UPI or bank", "Payment details come from the XTSY team. Renew, move up or down whenever you need."],
] as const;

function HomePage() {
  const { rows } = Route.useLoaderData();
  const plansByModel = plansByModelFrom(rows);
  const restaurant = plansByModel["Restaurant POS"] ?? PUBLIC_PLANS;
  const range = priceRange(restaurant);
  const [product, setProduct] = useState("");
  const [plan, setPlan] = useState("");
  const start = (model: string, p: string) => { setProduct(model); setPlan(p); document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" }); };
  return (
    <SiteShell>
      <section className="px-4 pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="lg:pt-6">
            <p className="xt-eyebrow text-primary">POS by XTSY · subscriptions for hospitality</p>
            <h1 className="mt-2 text-[3.3rem] leading-[0.9] sm:text-7xl lg:text-[5.6rem]">One subscription. Every counter, desk and booking.</h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-relaxed text-muted-foreground">
              Pick the POS made for your business: a restaurant, a hostel, a hotel, a resort or a tour desk. XTSY sets it up, you pay monthly, and it keeps working when the internet doesn't.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#plans" className="inline-flex min-h-12 items-center rounded-full bg-primary px-6 font-extrabold text-primary-foreground hover:opacity-90">Plans from ₹{range.low} a month</a>
              <a href="#models" className="inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-extrabold ring-1 ring-[#1F2230]/20 hover:bg-white">Find your POS<ArrowRight className="size-4" /></a>
            </div>
            <ul className="mt-8 grid max-w-[36rem] gap-2 text-sm sm:grid-cols-2">
              {["No setup on your side: XTSY does it", "GST bills, UPI and card", "Every device in sync, live", "Support 7 days a week"].map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>
              ))}
            </ul>
          </div>
          <div id="plans" className="scroll-mt-24"><PlanBuilder plansByModel={plansByModel} onStart={start} /></div>
        </div>
      </section>

      <Ticker words={["Restaurant POS", "Hostel POS", "Hotel POS", "Resort POS", "Tourism POS", "Works offline", "GST-ready", "UPI and card", "Channel manager", "Live sync", "Made in Coimbatore"]} />

      <SiteSection id="models" eyebrow="Five POS models" title="Made for how you run it" intro="Each model has its own apps, its own sign-in and its own price list. XTSY runs them all from one console.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {SITE_MODELS.map((m, i) => (
            <a key={m.id} href={m.path}
              className={cn("group flex flex-col rounded-3xl p-6 ring-1 transition-colors", i < 2 ? "lg:col-span-3" : "lg:col-span-2",
                m.status === "live" ? "bg-[#1F2230] text-[#FAF7F2] ring-[#1F2230]" : m.status === "pilot" ? "bg-white ring-primary/40 hover:ring-primary" : "bg-white ring-[#1F2230]/10 hover:ring-[#1F2230]/40")}>
              <span className={cn("self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold", m.status === "live" ? "bg-[#2F4A3F] text-[#FAF7F2]" : m.status === "pilot" ? "bg-primary text-primary-foreground" : "bg-[#1F2230]/10")}>{STATUS_LABEL[m.status]}</span>
              <h3 className={cn("mt-4 leading-none", i < 2 ? "text-5xl" : "text-4xl")} style={{ fontFamily: "var(--font-brand)" }}>{m.name}</h3>
              <p className={cn("mt-1 text-sm", m.status === "live" ? "text-[#FAF7F2]/70" : "text-muted-foreground")}>{m.for}</p>
              <p className="mt-4">{m.line}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-6 font-bold group-hover:underline">{m.status === "live" ? "See plans and demos" : m.status === "pilot" ? "See the pilot" : "See what's coming"}<ArrowRight className="size-4" /></span>
            </a>
          ))}
        </div>
      </SiteSection>

      <SiteSection eyebrow="Recorded on the real app" title="See it running" tone="sand" intro="POS Billdesk billing a table, sending the KOT and taking UPI. More demos on the Restaurant POS page.">
        <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl bg-[#1F2230] p-3 sm:p-4"><DemoVideo id="billing" title="Bill a table on POS Billdesk" /></div>
          <div>
            <ul className="space-y-4">
              {[["Running every day", "At TAB Bistro by XTSY, through breakfast, dinner and late nights."], ["Built where it's used", "Every screen is tried in service before it's sold."], ["Honest status", "Live means in use today. Pilot and coming soon say so."]].map(([t, d]) => (
                <li key={t} className="border-l-2 border-primary pl-4"><p className="font-extrabold">{t}</p><p className="mt-0.5 text-sm text-muted-foreground">{d}</p></li>
              ))}
            </ul>
            <a href="/restaurant-pos" className="mt-6 inline-flex items-center gap-1 font-extrabold text-primary hover:underline">Watch all the demos<ArrowRight className="size-4" /></a>
          </div>
        </div>
      </SiteSection>

      <SiteSection eyebrow="How subscribing works" title="Three steps, no setup on your side">
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-3xl bg-white p-6 ring-1 ring-[#1F2230]/10">
              <span className="font-brand text-6xl leading-none text-primary">{i + 1}</span>
              <p className="mt-3 text-lg font-extrabold">{t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteSection eyebrow="Every plan, every model" title="What you always get" tone="ink">
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map(([t, d]) => (
            <div key={t} className="border-t border-[#FAF7F2]/20 pt-4"><p className="text-lg font-extrabold">{t}</p><p className="mt-1 text-sm text-[#FAF7F2]/70">{d}</p></div>
          ))}
        </div>
      </SiteSection>

      <SiteSection id="status" eyebrow="Updated November 2026" title="Where XTSY POS stands today" intro="Live means businesses use it now. Nothing is sold before it works.">
        <StatusBoard />
      </SiteSection>

      <SiteSection eyebrow="Questions" title="Before you subscribe" tone="sand"><Faq items={faqFor(restaurant)} /></SiteSection>

      <SiteSection id="enquire" eyebrow="Start" title="Start your plan" intro="Tell us your model and plan. Your enquiry opens in WhatsApp, addressed to the XTSY team.">
        <EnquiryForm product={product} setProduct={setProduct} plan={plan} setPlan={setPlan} plansByModel={plansByModel} />
      </SiteSection>

      <ClosingCta title="Your next bill is waiting." text="Restaurant POS is live from ₹449 a month per outlet, and Hostel POS starts at ₹2,299 a month per property. Hotels, resorts and tour desks can join the waitlist." href="#enquire" label="Start a plan" />
    </SiteShell>
  );
}

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { PublicPlan } from "@/lib/plans";
import { SITE_MODELS, STATUS_LABEL, type SiteModel } from "@/lib/site-models";
import { cn } from "@/lib/utils";
import { DemoTheatre } from "./DemoTheatre";
import { DemoVideo } from "./DemoVideo";
import { EnquiryForm } from "./EnquiryForm";
import { Faq } from "./SiteBlocks";
import { ClosingCta, SiteSection, SiteShell, Ticker } from "./SiteChrome";
import { PlanBills, PlanComparison } from "./SitePlans";

const STATE_TONE: Record<string, string> = { "Rolling out": "bg-[#C98A1B]/15 text-[#7A520C]", Planned: "bg-[#1F2230]/10 text-[#1F2230]" };

/** One POS model's page: hero, what it does, how it looks, its own prices, questions and an enquiry. */
export function ModelPage({ model, plansByModel }: { model: SiteModel; plansByModel: Record<string, PublicPlan[]> }) {
  const plans = plansByModel[model.name] ?? [];
  const [product, setProduct] = useState(model.name);
  const [plan, setPlan] = useState("");
  const go = (p: string) => { setProduct(model.name); setPlan(p); document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" }); };
  const low = plans.map((p) => p.price).filter((p): p is number => p !== null).sort((a, b) => a - b)[0];
  return (
    <SiteShell>
      <section className="px-4 pb-14 pt-10 md:pb-20 md:pt-16">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <p className="xt-eyebrow text-primary">{model.name} · {STATUS_LABEL[model.status]}</p>
            <h1 className="mt-2 text-[3.1rem] leading-[0.92] sm:text-7xl">{model.headline}</h1>
            <p className="mt-5 max-w-[36rem] text-lg leading-relaxed text-muted-foreground">{model.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => go("")} className="inline-flex min-h-12 items-center rounded-full bg-primary px-6 font-extrabold text-primary-foreground hover:opacity-90">{model.cta}</button>
              <a href="#plans" className="inline-flex min-h-12 items-center rounded-full px-6 font-extrabold ring-1 ring-[#1F2230]/20 hover:bg-white">{low !== undefined ? `Plans from ₹${low.toLocaleString("en-IN")} a month` : "See pricing"}</a>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">For {model.for.toLowerCase()}.</p>
          </div>
          <ModelMedia model={model} />
        </div>
      </section>

      <Ticker words={model.ticker} />

      <SiteSection eyebrow="What it does" title={model.status === "soon" ? "What it will do" : `Inside ${model.name}`}>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {model.features.map((f) => (
            <div key={f.title} className="border-t-2 border-[#1F2230] pt-4">
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">{f.title}{f.state ? <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", STATE_TONE[f.state] ?? STATE_TONE["Planned"])}>{f.state}</span> : null}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </SiteSection>

      {model.id === "restaurant_pos" ? (
        <SiteSection eyebrow="Recorded on the real app" title="Watch it work" intro="Real screens, recorded with TAB Bistro's menu. The owner's screens use sample figures, marked Demo data." tone="sand">
          <DemoTheatre start="waiter" />
        </SiteSection>
      ) : null}
      {model.id === "hostel_pos" ? (
        <SiteSection eyebrow="Demo property" title="How it looks" tone="sand">
          <div className="grid gap-5 lg:grid-cols-2">
            {[["/site/stays-rates.jpg", "Rates and availability, with suggested rates"], ["/site/stays-home.jpg", "Home: arrivals, occupancy and what's worth a look"]].map(([src, cap]) => (
              <figure key={src} className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#1F2230]/10">
                <img src={src} alt={`Hostel POS ${cap!.toLowerCase()}`} width={1440} height={900} loading="lazy" className="block h-auto w-full" />
                <figcaption className="border-t border-[#1F2230]/10 px-4 py-2.5 text-xs text-muted-foreground">{cap}. Demo data.</figcaption>
              </figure>
            ))}
          </div>
        </SiteSection>
      ) : null}

      <SiteSection id="plans" eyebrow="Subscription" title={`${model.name} pricing`} intro={plans.length ? (model.id === "restaurant_pos" ? "Per outlet per month. Each plan adds to the one before it; move up or down any time." : "Per property per month. Move up or down any time.") : undefined}>
        <PlanBills model={model} plans={plans} onPick={go} />
        <PlanComparison model={model} plans={plans} />
        <p className="mt-6 text-sm text-muted-foreground">No payment on this website: the XTSY team sets you up and shares the payment details. Support runs every day of the week, except national holidays.</p>
      </SiteSection>

      <SiteSection eyebrow="Questions" title={`About ${model.name}`} tone="sand"><Faq items={model.faq} /></SiteSection>

      <SiteSection id="enquire" eyebrow="Start" title={model.status === "live" ? `Start with ${model.name}` : model.cta} intro="Your enquiry opens in WhatsApp, addressed to the XTSY team.">
        <EnquiryForm product={product} setProduct={setProduct} plan={plan} setPlan={setPlan} plansByModel={plansByModel} />
      </SiteSection>

      <SiteSection eyebrow="One XTSY" title="The other POS models" tone="sand">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SITE_MODELS.filter((m) => m.id !== model.id).map((m) => (
            <a key={m.id} href={m.path} className="group rounded-2xl bg-white p-5 ring-1 ring-[#1F2230]/10 hover:ring-primary">
              <p className="text-xs font-bold text-primary">{STATUS_LABEL[m.status]}</p>
              <p className="font-brand mt-1 text-2xl leading-none">{m.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{m.line}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold group-hover:text-primary">Explore<ArrowRight className="size-4" /></span>
            </a>
          ))}
        </div>
      </SiteSection>

      <ClosingCta title={model.status === "live" ? "Your next bill is waiting." : "Be first in line."} text={model.status === "live" ? "Tell us about your outlet; the XTSY team sets it up and you bill the same week." : "Tell us about your business and the XTSY team will reach you first."} href="#enquire" label={model.cta} />
    </SiteShell>
  );
}

function ModelMedia({ model }: { model: SiteModel }) {
  if (model.id === "restaurant_pos") {
    return <div className="rounded-[28px] bg-[#1F2230] p-3 sm:p-4"><DemoVideo id="billing" title="Bill a table on POS Billdesk" eager /><p className="mt-3 px-1 text-sm text-[#FAF7F2]/75">POS Billdesk, billing a table. Recorded on the real app.</p></div>;
  }
  if (model.id === "hostel_pos") {
    return (
      <figure className="overflow-hidden rounded-[28px] bg-[#1F2230] p-3 sm:p-4">
        <img src="/site/stays-rates.jpg" alt="Hostel POS rates calendar with suggested rates" width={1440} height={900} className="block h-auto w-full rounded-xl" />
        <figcaption className="mt-3 px-1 text-sm text-[#FAF7F2]/75">Rates and availability with suggested rates. Demo property and data.</figcaption>
      </figure>
    );
  }
  return (
    <div className="rounded-[28px] bg-[#1F2230] p-6 text-[#FAF7F2] sm:p-8">
      <p className="xt-eyebrow text-[#E8B4C0]">Coming soon</p>
      <p className="font-brand mt-1 text-4xl leading-none">{model.name}</p>
      <ul className="mt-5 space-y-3">
        {model.features.map((f) => <li key={f.title} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-[#E8B4C0]" /><span><span className="font-bold">{f.title}</span><span className="block text-sm text-[#FAF7F2]/70">{f.text}</span></span></li>)}
      </ul>
    </div>
  );
}

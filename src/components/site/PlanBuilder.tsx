import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { featureName, type PublicPlan, STAY_FEATURE_STATE } from "@/lib/plans";
import { SITE_MODELS, STATUS_LABEL } from "@/lib/site-models";
import { cn } from "@/lib/utils";

/**
 * The home page's centrepiece: pick a POS model, a plan and how many outlets, and see the monthly
 * total at once. Prices come from the live catalogue; models without prices say what happens next.
 */
export function PlanBuilder({ plansByModel, onStart }: { plansByModel: Record<string, PublicPlan[]>; onStart: (model: string, plan: string) => void }) {
  const [modelName, setModelName] = useState(SITE_MODELS[0]!.name);
  const model = SITE_MODELS.find((m) => m.name === modelName) ?? SITE_MODELS[0]!;
  const plans = plansByModel[model.name] ?? [];
  const [planId, setPlanId] = useState<string>("");
  const plan = plans.find((p) => p.id === planId) ?? plans.find((p) => p.highlight) ?? plans[0];
  const [outlets, setOutlets] = useState(1);
  const stay = model.id !== "restaurant_pos" && model.id !== "tourism_pos";
  const total = plan?.price != null ? plan.price * outlets : null;
  return (
    <div className="rounded-[28px] bg-[#1F2230] p-5 text-[#FAF7F2] shadow-[0_40px_80px_-40px_rgba(31,34,48,0.8)] sm:p-7">
      <p className="xt-eyebrow text-[#E8B4C0]">Build your plan</p>
      <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1" role="radiogroup" aria-label="POS model">
        {SITE_MODELS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={m.name === modelName} onClick={() => { setModelName(m.name); setPlanId(""); }}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ring-1", m.name === modelName ? "bg-[#FAF7F2] text-[#1F2230] ring-[#FAF7F2]" : "ring-[#FAF7F2]/25 hover:ring-[#FAF7F2]/60")}>
            {m.short}
          </button>
        ))}
      </div>

      {plans.length ? (
        <>
          <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Plan">
            {plans.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === plan?.id} onClick={() => setPlanId(p.id)}
                className={cn("flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1", p.id === plan?.id ? "bg-[#A12444] ring-[#A12444]" : "ring-[#FAF7F2]/15 hover:ring-[#FAF7F2]/40")}>
                <span><span className="font-brand block text-2xl leading-none">{p.name}</span><span className="mt-0.5 block text-xs opacity-75">{p.tagline}</span></span>
                <span className="shrink-0 text-right font-bold tabular-nums">{p.price == null ? "Quote" : `₹${p.price.toLocaleString("en-IN")}`}<span className="block text-[11px] font-normal opacity-75">a month</span></span>
              </button>
            ))}
          </div>
          {plan ? (() => {
            const before = plans[plans.indexOf(plan) - 1];
            const adds = plan.features.filter((f) => !before?.features.includes(f) && f !== "online_ordering");
            return (
              <div className="mt-4 text-sm">
                <p className="opacity-75">{before ? `Everything in ${before.name}, plus:` : "Includes:"}</p>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {adds.slice(0, 6).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#E8B4C0]" />{featureName(f, stay)}{stay && STAY_FEATURE_STATE[f] ? ` (${STAY_FEATURE_STATE[f]!.toLowerCase()})` : ""}</li>)}
                </ul>
              </div>
            );
          })() : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#FAF7F2]/15 pt-5">
            <div className="flex items-center gap-3">
              <span className="text-sm">{model.id === "restaurant_pos" ? "Outlets" : "Properties"}</span>
              <div className="flex items-center rounded-full ring-1 ring-[#FAF7F2]/25">
                <button type="button" aria-label="One fewer" className="grid size-9 place-items-center disabled:opacity-30" disabled={outlets <= 1} onClick={() => setOutlets((n) => Math.max(1, n - 1))}><Minus className="size-4" /></button>
                <span className="w-7 text-center font-bold tabular-nums" aria-live="polite">{outlets}</span>
                <button type="button" aria-label="One more" className="grid size-9 place-items-center disabled:opacity-30" disabled={outlets >= 50} onClick={() => setOutlets((n) => Math.min(50, n + 1))}><Plus className="size-4" /></button>
              </div>
            </div>
            <p className="text-right"><span className="font-brand block text-4xl leading-none tabular-nums">{total == null ? "On quote" : `₹${total.toLocaleString("en-IN")}`}</span><span className="text-xs opacity-75">{total == null ? "the team prices it with you" : "a month, before GST"}</span></p>
          </div>
          <button type="button" onClick={() => onStart(model.name, plan?.name ?? "")} className="mt-5 w-full rounded-full bg-[#FAF7F2] py-3.5 font-extrabold text-[#1F2230] hover:bg-white">
            Start {plan?.name ?? model.name}{outlets > 1 ? ` for ${outlets}` : ""}
          </button>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-sm font-bold text-[#E8B4C0]">{STATUS_LABEL[model.status]}</p>
          <p className="font-brand mt-1 text-3xl leading-none">{model.name}</p>
          <p className="mt-2 text-sm opacity-80">{model.line}</p>
          <p className="mt-4 rounded-2xl bg-[#FAF7F2]/10 p-4 text-sm">{model.status === "pilot" ? "In its pilot: the XTSY team sets up each property by invitation." : "Coming next. Join the waitlist to hear the launch prices first."}</p>
          <button type="button" onClick={() => onStart(model.name, "")} className="mt-5 w-full rounded-full bg-[#FAF7F2] py-3.5 font-extrabold text-[#1F2230] hover:bg-white">{model.cta}</button>
        </div>
      )}
    </div>
  );
}

import { Check, X } from "lucide-react";
import { FEATURE_NAMES, PUBLIC_FEATURES, STAY_ADDONS, STAY_FEATURES, STAY_FEATURE_STATE, featureName, priceText, roomPriceText, type Feature, type PublicPlan, seatAppsFor } from "@/lib/plans";
import type { SiteModel } from "@/lib/site-models";
import { cn } from "@/lib/utils";

/*
 * Prices on the website, model by model. Each plan is printed as a thermal bill (as the real
 * slip) that lists only what it adds over the plan before. A model with no plans yet shows a
 * "prices on request" bill instead of an empty section.
 */

const STAY_IDS = ["hostel_pos", "hotel_pos", "resort_pos"];
const isStay = (model: SiteModel) => STAY_IDS.includes(model.id);
/** The feature's name, with where it stands for stays ("Channel manager … (rolling out)"). Never call it live early. */
const nameOf = (model: SiteModel, f: Feature) => {
  const state = isStay(model) ? STAY_FEATURE_STATE[f] : undefined;
  return `${featureName(f, isStay(model))}${state ? ` (${state.toLowerCase()})` : ""}`;
};
const listed = (model: SiteModel): Feature[] => (isStay(model) ? STAY_FEATURES.filter((f) => !STAY_ADDONS.includes(f)) : PUBLIC_FEATURES);

export function PlanBills({ model, plans, onPick }: { model: SiteModel; plans: PublicPlan[]; onPick: (plan: string) => void }) {
  if (!plans.length) return <PricesOnRequest model={model} onPick={() => onPick("")} />;
  return (
    <div className={cn("grid items-start gap-6 sm:grid-cols-2", plans.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {plans.map((p, i) => <PlanBill key={p.id} model={model} plan={p} before={plans[i - 1]} onPick={() => onPick(p.name)} />)}
      {isStay(model) ? (
        <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-full">
          Add-on for any plan: {STAY_ADDONS.map((f) => nameOf(model, f)).join(", ")}. Switched on only if you ask; a café keeps its own Restaurant POS subscription and sign-in.
        </p>
      ) : null}
    </div>
  );
}

function Slip({ children, highlight }: { children: React.ReactNode; highlight?: boolean | undefined }) {
  return (
    <article className={cn("relative", highlight && "lg:-mt-4")}>
      <div className="bg-white px-5 pb-6 pt-5 text-[#1F2230] shadow-[0_24px_50px_-28px_rgba(31,34,48,0.55)] ring-1 ring-[#1F2230]/10" style={{ fontFamily: '"Courier New", ui-monospace, monospace' }}>{children}</div>
      <div aria-hidden="true" className="h-3" style={{ background: "radial-gradient(circle at 7px 0, #ffffff 6px, transparent 6.5px) 0 0 / 14px 12px repeat-x" }} />
    </article>
  );
}

const rule = <div className="my-3 border-t border-dashed border-[#1F2230]/35" aria-hidden="true" />;

function PlanBill({ model, plan: p, before, onPick }: { model: SiteModel; plan: PublicPlan; before?: PublicPlan | undefined; onPick: () => void }) {
  const adds = listed(model).filter((f) => p.features.includes(f) && !before?.features.includes(f));
  const seats = seatAppsFor(model.id);
  return (
    <Slip highlight={p.highlight}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs">{model.name.toUpperCase()}</p>
        {p.highlight ? <p className="-rotate-3 rounded border-2 border-[#A12444] px-1.5 text-[11px] font-bold text-[#A12444]">MOST CHOSEN</p> : null}
      </div>
      <h3 className="mt-1 text-[2rem] leading-none" style={{ fontFamily: "var(--font-brand)" }}>{p.name}</h3>
      {p.tagline ? <p className="mt-1.5 text-xs leading-snug">{p.tagline}</p> : null}
      {rule}
      <dl className="space-y-1 text-[13px]">
        {seats.map(([a, label]) => (
          <div key={a} className="flex justify-between gap-2"><dt>{label} devices</dt><dd className="tabular-nums">{p.seats[a] === null ? "Unlimited" : p.seats[a] === 0 ? "—" : `${p.seats[a]}${isStay(model) && (p.maxProperties ?? 1) > 1 ? " per property" : ""}`}</dd></div>
        ))}
      </dl>
      {rule}
      <p className="text-[13px]">{before ? `Everything on ${before.name}, plus:` : "Includes:"}</p>
      <ul className="mt-1.5 space-y-1 text-[13px]">{adds.map((f) => <li key={f}>{nameOf(model, f)}</li>)}</ul>
      {rule}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">TOTAL</span>
        <span className="text-[1.9rem] font-bold leading-none tabular-nums">{p.price === null ? "Quote" : `₹${p.price.toLocaleString("en-IN")}`}</span>
      </div>
      <p className="mt-1 text-right text-xs">{p.price === null ? "call us" : model.id === "restaurant_pos" ? "a month, per outlet" : (p.maxProperties ?? 1) > 1 ? `a month, up to ${p.maxProperties} properties` : "a month, one property"}</p>
      {isStay(model) && p.includedRooms != null ? <p className="mt-1 text-right text-xs font-bold">{roomPriceText(p)}</p> : null}
      <button type="button" onClick={onPick} className={cn("mt-5 w-full rounded-full py-3 font-sans text-sm font-extrabold text-white", p.highlight ? "bg-[#A12444] hover:bg-[#8a1d3a]" : "bg-[#1F2230] hover:bg-black")}>
        {p.price === null ? "Ask for a quote" : `Choose ${p.name}`}
      </button>
    </Slip>
  );
}

/** A model whose prices aren't set yet: say so plainly and offer the next step. */
function PricesOnRequest({ model, onPick }: { model: SiteModel; onPick: () => void }) {
  return (
    <div className="max-w-md">
      <Slip>
        <p className="text-xs">{model.name.toUpperCase()}</p>
        <h3 className="mt-1 text-[2rem] leading-none" style={{ fontFamily: "var(--font-brand)" }}>{model.status === "soon" ? "Launch prices" : "Pilot prices"}</h3>
        <p className="mt-1.5 text-xs leading-snug">{model.status === "soon" ? "Set before launch. Join the waitlist and you hear them first." : "Pilot properties are set up by the XTSY team. Prices are published here once the plans are live."}</p>
        {rule}
        <ul className="space-y-1 text-[13px]">{model.features.slice(0, 5).map((f) => <li key={f.title}>{f.title}{f.state ? ` (${f.state.toLowerCase()})` : ""}</li>)}</ul>
        {rule}
        <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-bold">TOTAL</span><span className="text-[1.9rem] font-bold leading-none">On request</span></div>
        <button type="button" onClick={onPick} className="mt-5 w-full rounded-full bg-[#A12444] py-3 font-sans text-sm font-extrabold text-white hover:bg-[#8a1d3a]">{model.cta}</button>
      </Slip>
    </div>
  );
}

/** Every plan beside every feature, so nothing hides behind "contact us". */
export function PlanComparison({ model, plans }: { model: SiteModel; plans: PublicPlan[] }) {
  if (plans.length < 2) return null;
  const seats = seatAppsFor(model.id);
  const features = listed(model).filter((f) => plans.some((p) => p.features.includes(f)));
  return (
    <div className="mt-12">
      <p className="mb-2 text-center text-xs text-muted-foreground md:hidden">Swipe the table sideways to compare every plan.</p>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-[#1F2230]/10">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <caption className="sr-only">{model.name} plans compared, feature by feature</caption>
          <thead>
            <tr className="bg-[#F1EBE1]">
              <th scope="col" className="sticky left-0 bg-[#F1EBE1] p-3 font-bold">Compare every plan</th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className={cn("p-3 text-center", p.highlight && "bg-[#A12444]/10")}>
                  <span className="font-brand block text-xl leading-none">{p.name}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{priceText(p.price)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1F2230]/10">
            {seats.map(([app, label]) => (
              <tr key={app}>
                <th scope="row" className="sticky left-0 bg-white p-3 font-semibold">{label} devices</th>
                {plans.map((p) => { const n = p.seats[app]; return <td key={p.id} className={cn("p-3 text-center tabular-nums", p.highlight && "bg-[#A12444]/5", n === 0 && "text-muted-foreground")}>{n === null ? "Unlimited" : n === 0 ? "—" : n}</td>; })}
              </tr>
            ))}
            {features.map((f) => (
              <tr key={f}>
                <th scope="row" className="sticky left-0 bg-white p-3 font-normal">{nameOf(model, f) || FEATURE_NAMES[f]}</th>
                {plans.map((p) => (
                  <td key={p.id} className={cn("p-3 text-center", p.highlight && "bg-[#A12444]/5")}>
                    {p.features.includes(f) ? <Check className="mx-auto size-4 text-primary" aria-label="Included" /> : <X className="mx-auto size-4 text-muted-foreground/40" aria-label="Not included" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

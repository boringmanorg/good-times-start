import { Check, MessageCircle, X } from "lucide-react";
import { useEntitlements } from "@/lib/use-entitlements";
import { useRestaurantSettings } from "@/lib/use-settings";
import { PUBLIC_FEATURES as FEATURES, FEATURE_NAMES, PUBLIC_PLANS, SEAT_APPS, priceText, seatUseText, subscriptionText, whatsappLink, type SeatApp } from "@/lib/plans";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/** Settings → Plan & subscription: what this restaurant's plan includes and how full its device seats are. */
export function PlanSettings() {
  const plan = useEntitlements();
  const settings = useRestaurantSettings();
  const name = settings.name || "our restaurant";
  if (!plan) {
    return <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Your plan shows here once this device has been online. Billing works either way.</p>;
  }
  const upgrade = whatsappLink(`Hi XTSY, I'd like to change the XTSY POS plan for ${name} (now ${plan.planName}).`);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Current plan</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-brand text-3xl">{plan.planName}</h2>
            <p className="text-sm text-muted-foreground">{subscriptionText(plan)}{!plan.quote && !plan.complimentary ? ` · ${priceText(plan.price)}` : ""}</p>
          </div>
          <a href={upgrade} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }))}><MessageCircle />Change plan with XTSY</a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {(["pos", "waiter", "manager"] as SeatApp[]).map((app) => {
            const s = plan.seats[app];
            const full = s.limit !== null && s.used >= s.limit;
            return (
              <div key={app} className="rounded-xl bg-secondary p-4">
                <p className="text-xs text-muted-foreground">{SEAT_APPS[app]} devices</p>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", full && s.limit !== 0 ? "text-warning" : "")}>{s.limit === 0 ? "Not included" : seatUseText(s)}</p>
              </div>
            );
          })}
        </div>
        {plan.waiting ? <p className="mt-3 text-sm text-warning">{plan.waiting} device{plan.waiting === 1 ? " is" : "s are"} waiting for a free seat. Release an old device in Terminals, or change plan.</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">A device takes a seat when it first opens its app. Releasing a device in Terminals frees its seat.</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Included in your plan</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const on = plan.features[f] !== false;
            return (
              <li key={f} className={cn("flex items-center gap-2 text-sm", on ? "" : "text-muted-foreground")}>
                {on ? <Check className="size-4 text-success" /> : <X className="size-4" />}{FEATURE_NAMES[f]}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">All plans</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PUBLIC_PLANS.map((p) => (
            <div key={p.id} className={cn("rounded-xl border p-4", p.id === plan.plan ? "border-primary bg-primary-tint" : "border-border")}>
              <p className="font-semibold">{p.name}{p.id === plan.plan ? <span className="ml-2 text-xs font-semibold text-primary">Yours</span> : null}</p>
              <p className="text-sm text-muted-foreground">{priceText(p.price)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

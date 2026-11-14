import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { consoleToken } from "@/lib/console-client";
import { onboardPlatformRestaurant } from "@/lib/platform-restaurants.functions";
import { emailProblem } from "@/lib/platform-login-logic";
import { passwordProblem } from "@/lib/staff-login-logic";
import { BUSINESS_MODELS, ONBOARDING_PLANS, cleanSlug, nameProblem, slugProblem, type BusinessModel } from "@/lib/platform-restaurant-logic";
import type { PlanRow } from "@/lib/console-api";
import { cn } from "@/lib/utils";
import { field } from "./ConsoleBits";

/** "TAB Bistro by XTSY" → "tab-bistro-by-xtsy", trimmed to the slug rules. */
const slugFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
/** "tab-bistro" → "tabbistro.pos", the made-up domain the outlet's logins live on. */
const domainFrom = (slug: string) => `${slug.replace(/-/g, "") || "outlet"}.pos`;

/**
 * Onboard a new outlet: account, restaurant and the owner's login in one pass.
 * Super admin only — restaurants cannot create themselves.
 */
export function ConsoleOnboard({ plans }: { plans: PlanRow[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState<BusinessModel>("restaurant");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState("");
  const [plan, setPlan] = useState<string>("basic");
  const [phone, setPhone] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerEmailTouched, setOwnerEmailTouched] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? cleanSlug(slug) : slugFrom(name);
  const effectiveOwner = ownerEmailTouched ? ownerEmail : (name ? `admin@${domainFrom(effectiveSlug)}` : "");
  const problem = nameProblem(name) ?? slugProblem(effectiveSlug) ?? emailProblem(effectiveOwner) ?? passwordProblem(password);

  const reset = () => {
    setName(""); setModel("restaurant"); setSlug(""); setSlugTouched(false); setCity("");
    setPlan("basic"); setPhone(""); setBillingEmail(""); setOwnerEmail(""); setOwnerEmailTouched(false);
    setOwnerName(""); setPassword("");
  };

  const submit = async () => {
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try {
      const r = await onboardPlatformRestaurant({ data: {
        token: await consoleToken(), name: name.trim(), model, slug: effectiveSlug, city, plan,
        billingPhone: phone, billingEmail, ownerEmail: effectiveOwner,
        ownerName: ownerName.trim() || "Admin", ownerPassword: password,
      } });
      toast.success(`${name.trim()} onboarded — owner login ${r.ownerEmail}`);
      reset();
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't onboard the outlet"); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}><Plus />Onboard a new outlet</Button>
    );
  }

  const planRows = ONBOARDING_PLANS.map((id) => plans.find((p) => p.id === id)).filter((p): p is PlanRow => !!p);

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-4">
      <h2 className="flex items-center gap-2 font-brand text-xl"><Store className="size-5 text-primary" />Onboard a new outlet</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Creates the account, the outlet and its owner login together. It starts on a 14-day trial of the plan you choose —
        record the first payment under Renewal and payment to make it live.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Outlet name
          <input value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder="TAB Bistro by XTSY" className={field} />
        </label>
        <label className="text-sm font-medium">Business model
          <select value={model} onChange={(e) => setModel(e.target.value as BusinessModel)} className={field}>
            {BUSINESS_MODELS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">City
          <input value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder="Shillong" className={field} />
        </label>
        <label className="text-sm font-medium">QR address (slug)
          <input value={slugTouched ? slug : effectiveSlug} maxLength={40} spellCheck={false}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} className={cn(field, "font-mono")} />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Guests scan to /order/{effectiveSlug || "…"}</span>
        </label>
        <label className="text-sm font-medium">Billing phone
          <input value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} className={field} />
        </label>
        <label className="text-sm font-medium">Billing email
          <input value={billingEmail} maxLength={120} onChange={(e) => setBillingEmail(e.target.value)} className={field} />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Plan</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {planRows.map((p) => (
            <button key={p.id} type="button" onClick={() => setPlan(p.id)}
              className={cn("rounded-xl border p-3 text-left", plan === p.id ? "border-primary bg-primary/10" : "border-border bg-secondary")}>
              <span className="block text-sm font-bold">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.quote ? "On request" : `₹${p.monthly_price}/month`}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{p.tagline}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 rounded-xl border border-border p-3">
        <h3 className="text-sm font-semibold">Owner login <span className="font-normal text-muted-foreground">· the outlet's admin; more logins are added under Logins</span></h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Login email
            <input value={ownerEmailTouched ? ownerEmail : effectiveOwner} maxLength={120} spellCheck={false}
              onChange={(e) => { setOwnerEmailTouched(true); setOwnerEmail(e.target.value); }} className={cn(field, "font-mono")} />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">A made-up address: no mail is sent, the login is confirmed at once.</span>
          </label>
          <label className="text-sm font-medium">Name shown
            <input value={ownerName} maxLength={60} onChange={(e) => setOwnerName(e.target.value)} placeholder="Admin" className={field} />
          </label>
          <label className="text-sm font-medium">First password
            <input value={password} maxLength={72} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} className={field} />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Share it with the owner; only XTSY can reset it later.</span>
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={busy || !!problem}>{busy ? "Onboarding…" : "Onboard outlet"}</Button>
        <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={busy}>Cancel</Button>
        {problem && (name || password) ? <span className="text-xs text-warning">{problem}</span> : null}
      </div>
    </div>
  );
}

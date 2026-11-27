import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { priceText, whatsappLink, type PublicPlan } from "@/lib/plans";
import { enquiryMessage, enquiryProblem, type Enquiry } from "@/lib/site-content";
import { ENQUIRY_PRODUCTS, SITE_MODELS } from "@/lib/site-models";

const BLANK: Enquiry = { product: "", name: "", business: "", city: "", phone: "", outlets: "1", plan: "", message: "" };
const SAVED = "xtsy-pos-enquiry";
const input = "mt-1 w-full rounded-xl border border-[#1F2230]/15 bg-white px-3.5 py-3 text-base";

/**
 * The enquiry: becomes a WhatsApp message to the XTSY team; a copy stays on the visitor's own
 * device to prefill next time. No database, no payment.
 */
export function EnquiryForm({ product, setProduct, plan, setPlan, plansByModel }: {
  product: string; setProduct: (p: string) => void; plan: string; setPlan: (p: string) => void; plansByModel: Record<string, PublicPlan[]>;
}) {
  const [form, setForm] = useState<Enquiry>(() => {
    if (typeof window === "undefined") return BLANK;
    try { const raw = window.localStorage.getItem(SAVED); return raw ? { ...BLANK, ...(JSON.parse(raw) as Partial<Enquiry>), message: "" } : BLANK; } catch { return BLANK; }
  });
  const [problem, setProblem] = useState("");
  const [sentTo, setSentTo] = useState("");
  const value: Enquiry = { ...form, product: product || form.product || "Restaurant POS", plan: plan || form.plan };
  const model = SITE_MODELS.find((m) => m.name === value.product) ?? SITE_MODELS[0]!;
  const plans = plansByModel[model.name] ?? [];
  const restaurant = model.id === "restaurant_pos";
  const set = (k: keyof Enquiry) => (e: { target: { value: string } }) => {
    if (k === "plan") setPlan(e.target.value);
    if (k === "product") { setProduct(e.target.value); setPlan(""); setForm((f) => ({ ...f, plan: "" })); }
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = enquiryProblem(value);
    setProblem(p ?? "");
    if (p) return;
    try { window.localStorage.setItem(SAVED, JSON.stringify(value)); } catch { /* private mode */ }
    const link = whatsappLink(enquiryMessage(value));
    setSentTo(link);
    window.location.assign(link);
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-3xl bg-white p-6 shadow-[0_24px_60px_-40px_rgba(31,34,48,0.6)] ring-1 ring-[#1F2230]/10 sm:grid-cols-2 md:p-8">
      <label className="text-sm font-semibold">POS model
        <select value={value.product} onChange={set("product")} className={input}>{ENQUIRY_PRODUCTS.map((n) => <option key={n}>{n}</option>)}</select>
      </label>
      <label className="text-sm font-semibold">Plan
        {plans.length ? (
          <select value={value.plan} onChange={set("plan")} className={input}><option value="">Help me choose</option>{plans.map((p) => <option key={p.id} value={p.name}>{p.name} · {priceText(p.price)}</option>)}</select>
        ) : <span className="mt-1 flex min-h-[3.1rem] items-center rounded-xl bg-[#F1EBE1] px-3.5 text-sm text-muted-foreground">{model.status === "soon" ? "Waitlist: prices before launch" : "Pilot: prices on request"}</span>}
      </label>
      <label className="text-sm font-semibold">Your name *<input autoComplete="name" value={value.name} onChange={set("name")} className={input} /></label>
      <label className="text-sm font-semibold">{restaurant ? "Restaurant / brand *" : "Business name *"}<input autoComplete="organization" value={value.business} onChange={set("business")} className={input} /></label>
      <label className="text-sm font-semibold">City *<input autoComplete="address-level2" value={value.city} onChange={set("city")} className={input} /></label>
      <label className="text-sm font-semibold">Mobile (WhatsApp) *<input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={value.phone} onChange={set("phone")} className={input} /></label>
      <label className="text-sm font-semibold sm:col-span-2">{restaurant ? "Outlets" : "Properties or branches"}
        <select value={value.outlets} onChange={set("outlets")} className={input}><option>1</option><option>2–5</option><option>6–20</option><option>More than 20</option></select>
      </label>
      <label className="text-sm font-semibold sm:col-span-2">What you need
        <textarea rows={3} maxLength={800} value={value.message} onChange={set("message")} className={input}
          placeholder={restaurant ? "Tables, counters, waiters, printers, anything special…" : "Rooms or beds, booking sites you use, outlets on site, anything special…"} />
      </label>
      {problem ? <p role="alert" className="text-sm font-semibold text-destructive sm:col-span-2">{problem}</p> : null}
      <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Opens WhatsApp with your details for the XTSY team. Nothing is stored on our servers.</p>
        <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground hover:opacity-90"><Send className="size-4" />Send on WhatsApp</button>
      </div>
      {sentTo ? <p className="text-sm sm:col-span-2">WhatsApp didn't open? <a href={sentTo} target="_blank" rel="noreferrer" className="font-bold text-primary underline">Tap here to send your enquiry</a>.</p> : null}
    </form>
  );
}

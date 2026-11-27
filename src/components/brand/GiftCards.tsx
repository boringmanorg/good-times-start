import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Gift, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase-app";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { cardState, giftCardTotals, issueProblem, normaliseCode, redeemProblem, type GiftCard, type GiftCardEvent } from "@/lib/gift-card-logic";
import { waLink } from "@/lib/marketing-logic";
import { cn } from "@/lib/utils";
import type { Outlet } from "@/lib/brand-logic";

const field = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";
const todayKey = () => new Date().toLocaleDateString("en-CA");
const STATE_LABEL = { active: "Active", used: "Used up", expired: "Expired", void: "Cancelled" } as const;
const STATE_CLASS = { active: "bg-success/15 text-success", used: "bg-secondary text-muted-foreground", expired: "bg-gold/15 text-warning", void: "bg-destructive/15 text-destructive" } as const;
const errText = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message) ?? "Something went wrong. Try again.";

/** Brand-wide gift cards: issue at any outlet, redeem at any outlet, one balance. */
export function GiftCards({ accountId, outlets, mine, admin, enabled }: { accountId: string | null; outlets: Outlet[]; mine: string | null; admin: boolean; enabled: boolean }) {
  const qc = useQueryClient();
  const today = todayKey();
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Outlet";
  const cards = useQuery({
    queryKey: ["gift-cards", accountId],
    enabled: enabled && !!accountId,
    queryFn: async () => {
      const [{ data: c, error }, { data: e }] = await Promise.all([
        supabase.from("gift_cards").select("*").eq("account_id", accountId!).order("created_at", { ascending: false }).limit(500),
        supabase.from("gift_card_events").select("id, card_id, restaurant_id, kind, amount, bill_no, at").eq("account_id", accountId!).order("at", { ascending: false }).limit(50),
      ]);
      if (error) throw error;
      return { cards: (c ?? []) as unknown as GiftCard[], events: (e ?? []) as unknown as GiftCardEvent[] };
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["gift-cards", accountId] });

  const [amount, setAmount] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [expires, setExpires] = useState("");
  const issue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("issue_gift_card", { _restaurant: mine!, _amount: Number(amount), _guest_name: name, _guest_phone: phone, ...(expires ? { _expires_on: expires } : {}) });
      if (error) throw error;
      return data as unknown as GiftCard;
    },
    onSuccess: (c) => { toast.success(`Gift card ${c.code} issued for ${formatINR(c.initial_amount)}`); setAmount(""); setName(""); setPhone(""); setExpires(""); refresh(); },
    onError: (e) => toast.error(errText(e)),
  });

  const [code, setCode] = useState(""); const [found, setFound] = useState<GiftCard | null>(null); const [take, setTake] = useState(""); const [billNo, setBillNo] = useState("");
  const lookup = () => {
    const c = cards.data?.cards.find((x) => x.code === normaliseCode(code)) ?? null;
    setFound(c); setTake("");
    if (!c) toast.error("No gift card with that code in this brand");
  };
  const redeem = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("redeem_gift_card", { _restaurant: mine!, _code: found!.code, _amount: Number(take), _bill_no: billNo });
      if (error) throw error;
      return data as unknown as GiftCard;
    },
    onSuccess: (c) => { toast.success(`${formatINR(Number(take))} taken · ${formatINR(c.balance)} left`); setFound(c); setTake(""); setBillNo(""); refresh(); },
    onError: (e) => toast.error(errText(e)),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("void_gift_card", { _restaurant: mine!, _card: id }); if (error) throw error; },
    onSuccess: () => { toast.success("Gift card cancelled"); refresh(); },
    onError: (e) => toast.error(errText(e)),
  });

  if (!enabled) return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Gift className="size-5 text-primary" />Gift cards</h2>
      <p className="mt-1 text-sm text-muted-foreground">Gift cards come with the Pro plan and above.</p>
    </section>
  );
  if (!accountId) return null;

  const list = cards.data?.cards ?? [];
  const t = giftCardTotals(list, today);
  const issueErr = issueProblem(amount, expires, today);
  const redeemErr = redeemProblem(found, take, today);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Gift className="size-5 text-primary" />Gift cards</h2>
        <p className="text-xs text-muted-foreground">One balance, usable at every outlet of the brand.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Loaded", formatINR(t.issued)], ["Still with guests", formatINR(t.outstanding)], ["Spent", formatINR(t.redeemed)], ["Active cards", String(t.active)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-background/40 p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 break-words text-lg font-bold tabular-nums">{cards.isLoading ? "…" : v}</div></div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {admin ? (
          <form className="rounded-xl border border-border p-4" onSubmit={(e) => { e.preventDefault(); if (!issueErr) issue.mutate(); }}>
            <h3 className="text-sm font-semibold">Issue a card</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs font-medium">Amount (₹)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" className={field} /></label>
              <label className="text-xs font-medium">Valid until (optional)<input type="date" min={today} value={expires} onChange={(e) => setExpires(e.target.value)} className={field} /></label>
              <label className="text-xs font-medium">Guest name<input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
              <label className="text-xs font-medium">Guest mobile<input inputMode="tel" maxLength={15} value={phone} onChange={(e) => setPhone(e.target.value)} className={field} /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!!issueErr || issue.isPending || !mine}><Ticket />{issue.isPending ? "Issuing…" : "Issue card"}</Button>
              {amount && issueErr ? <span className="text-xs text-muted-foreground">{issueErr}</span> : null}
            </div>
          </form>
        ) : null}

        <div className={cn("rounded-xl border border-border p-4", !admin && "lg:col-span-2")}>
          <h3 className="text-sm font-semibold">Redeem at this outlet</h3>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
            <input aria-label="Gift card code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GCXXXXXXXX" className={cn(field, "mt-0 font-mono uppercase")} />
            <Button type="submit" variant="outline" disabled={!code.trim()}><Search />Find</Button>
          </form>
          {found ? (
            <div className="mt-3 rounded-lg bg-background/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold">{found.code}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATE_CLASS[cardState(found, today)])}>{STATE_LABEL[cardState(found, today)]}</span>
              </div>
              <div className="mt-1 text-muted-foreground">{found.guest_name ?? "Guest"} · {formatINR(found.balance)} left of {formatINR(found.initial_amount)}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs font-medium">Amount to take<input inputMode="decimal" value={take} onChange={(e) => setTake(e.target.value)} className={field} /></label>
                <label className="text-xs font-medium">Bill no. (optional)<input maxLength={30} value={billNo} onChange={(e) => setBillNo(e.target.value)} className={field} /></label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!!redeemErr || redeem.isPending || !mine} onClick={() => redeem.mutate()}>{redeem.isPending ? "Saving…" : "Take from card"}</Button>
                {take && redeemErr ? <span className="text-xs text-muted-foreground">{redeemErr}</span> : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">To pay a bill, use Gift card at checkout on the Billdesk instead: it takes the amount off the card and links it to the bill. Use this box only for a spend with no POS bill, or the card is charged twice.</p>
            </div>
          ) : null}
        </div>
      </div>

      {cards.error ? <p className="mt-3 text-sm text-destructive">Couldn't load gift cards. Check the connection and try again.</p> : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="p-2">Card</th><th className="hidden p-2 sm:table-cell">Issued at</th><th className="p-2 text-right">Left</th><th className="p-2">Status</th><th className="p-2" />
          </tr></thead>
          <tbody>
            {list.slice(0, 50).map((c) => {
              const st = cardState(c, today);
              return (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="p-2"><span className="font-mono font-semibold">{c.code}</span><span className="block text-xs text-muted-foreground">{c.guest_name ?? "Guest"}{c.expires_on ? ` · till ${new Date(c.expires_on).toLocaleDateString("en-IN")}` : ""}</span></td>
                  <td className="hidden p-2 sm:table-cell">{outletName(c.issued_restaurant_id)}</td>
                  <td className="p-2 text-right tabular-nums">{formatINR(c.balance)}<span className="block text-xs text-muted-foreground">of {formatINR(c.initial_amount)}</span></td>
                  <td className="p-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATE_CLASS[st])}>{STATE_LABEL[st]}</span></td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {c.guest_phone && st === "active" ? <a className="mr-1 text-xs font-semibold text-primary" target="_blank" rel="noreferrer"
                      href={waLink(c.guest_phone, `Hi ${c.guest_name ?? ""}, your gift card ${c.code} has ${formatINR(c.balance)} to spend at any of our outlets.`)}>WhatsApp</a> : null}
                    {admin && c.status === "active" ? <Button size="sm" variant="ghost" aria-label={`Cancel ${c.code}`} disabled={cancel.isPending}
                      onClick={() => { if (window.confirm(`Cancel ${c.code}? ${formatINR(c.balance)} left on it will no longer be usable.`)) cancel.mutate(c.id); }}><Ban /></Button> : null}
                  </td>
                </tr>
              );
            })}
            {!cards.isLoading && list.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">No gift cards yet.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {cards.data?.events.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">Recent activity</summary>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
            {cards.data.events.slice(0, 20).map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>{e.kind === "issue" ? "Issued" : e.kind === "redeem" ? "Redeemed" : "Cancelled"} · {list.find((c) => c.id === e.card_id)?.code ?? "card"} · {outletName(e.restaurant_id)}{e.bill_no ? ` · ${e.bill_no}` : ""}</span>
                <span className="tabular-nums text-muted-foreground">{formatINR(e.amount)} · {new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

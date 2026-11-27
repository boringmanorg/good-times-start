import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Gift, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tabHead, tabWebsiteQuery } from '@/lib/tab-website';
import { waLink } from '@/lib/marketing-logic';
import { SILENT_PARAMS } from "@/lib/silent-route";

export const Route = createFileRoute("/_bistro/tab-bistro/gift-cards/{-$sub}")({
  params: SILENT_PARAMS, head: () => tabHead('Restaurant Gift Cards — TAB Bistro', 'Enquire about a TAB Bistro gift card for birthdays, celebrations and thoughtful thank-yous.', '/tab-bistro/gift-cards'), component: BistroGifts });
function BistroGifts() {
  const { data } = useSuspenseQuery(tabWebsiteQuery);
  const [amount, setAmount] = useState('1000');
  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const phone = data?.branding.whatsapp || data?.phone;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!phone) { setProblem('Please contact the restaurant to enquire about gift cards.'); return; }
    if (!name.trim() || !recipient.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0) { setProblem('Add your name, the recipient and a gift amount above zero.'); return; }
    setProblem('');
    window.location.assign(waLink(phone, `Hi TAB Bistro, I’d like to enquire about a ₹${amount} gift card.\nFrom: ${name.trim()}\nFor: ${recipient.trim()}\n${note.trim()}\nPlease confirm availability, payment and redemption terms.`));
  }
  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12"><p className="text-sm font-bold uppercase text-primary">A meal. A memory. A thoughtful gift.</p><h1 className="mt-3 font-brand text-5xl">Give a little TAB</h1><div className="mt-10 grid items-start gap-10 md:grid-cols-2">
    <div><div className="flex aspect-[1.6] max-w-lg flex-col justify-between rounded-lg bg-primary p-7 text-primary-foreground"><div className="flex items-start justify-between"><p className="font-brand text-4xl">TAB BISTRO<span className="mt-1 block font-sans text-xs">by XTSY™</span></p><Gift className="size-8" /></div><div><p className="text-sm">A gift of good food</p><p className="mt-1 text-3xl font-bold">₹{Number(amount) > 0 ? Number(amount).toLocaleString('en-IN') : '—'}</p></div></div><h2 className="mt-7 font-brand">For your favourite people</h2><p className="mt-3 max-w-lg text-muted-foreground">Celebrate a birthday, say thank you or treat someone to their next meal at TAB Bistro.</p><p className="mt-4 max-w-lg text-sm text-muted-foreground">The restaurant confirms availability, payment, validity and redemption terms before issuing a card. No payment is collected here.</p></div>
    <form onSubmit={submit} className="space-y-5"><h2 className="font-brand">Enquire about a gift card</h2><label className="block text-sm font-semibold">Gift amount (₹)<input type="number" min="1" step="1" required value={amount} onChange={e => setAmount(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-input bg-background px-3" /></label><label className="block text-sm font-semibold">Your name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="mt-2 min-h-12 w-full rounded-lg border border-input bg-background px-3" /></label><label className="block text-sm font-semibold">Who is it for?<input required maxLength={80} value={recipient} onChange={e => setRecipient(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-input bg-background px-3" /></label><label className="block text-sm font-semibold">A message or occasion (optional)<textarea maxLength={400} rows={3} value={note} onChange={e => setNote(e.target.value)} className="mt-2 w-full rounded-lg border border-input bg-background p-3" /></label>{problem ? <p role="alert" className="text-destructive">{problem}</p> : null}<Button type="submit" size="lg" disabled={!phone}><MessageCircle />Enquire on WhatsApp</Button></form>
  </div></main>;
}
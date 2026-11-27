import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tabHead, tabWebsiteQuery } from '@/lib/tab-website';
import { SILENT_PARAMS } from "@/lib/silent-route";

export const Route = createFileRoute("/_bistro/tab-bistro/menu/{-$sub}")({
  params: SILENT_PARAMS, head: () => tabHead('Menu — TAB Bistro by XTSY™', 'Browse TAB Bistro’s current dishes, portions and prices in New Shillong.', '/tab-bistro/menu'), component: BistroMenu });
function BistroMenu() {
  const { data } = useSuspenseQuery(tabWebsiteQuery);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const menu = data?.menu.filter(i => i.id) ?? [];
  const categories = [...new Set([...(data?.categoryOrder ?? []), ...menu.map(i => i.category)])].filter(c => menu.some(i => i.category === c));
  const items = menu.filter(i => (category === 'All' || i.category === category) && `${i.name} ${i.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase text-primary">Flavour. Food. Fusion.</p><h1 className="mt-2 font-brand text-5xl">Our menu</h1></div>{data?.online ? <Button asChild><Link to="/order/$slug" params={{ slug: data.slug }}>Order online <ArrowUpRight /></Link></Button> : null}</div>
    <div className="mt-7 flex flex-wrap gap-4"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-3"><Search className="size-5 text-muted-foreground" /><input aria-label="Search dishes" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find your favourite dish" className="min-h-12 w-full min-w-0 bg-transparent outline-none" /></label><select aria-label="Menu category" value={category} onChange={e => setCategory(e.target.value)} className="min-h-12 max-w-full rounded-lg border border-input bg-background px-3"><option>All</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
    <p className="mt-3 text-sm text-muted-foreground">Prices in ₹ · {data?.pricesIncludeGst ? 'GST included' : 'GST, where applicable, is added at billing'}</p>
    {!data ? <div className="py-16"><h2>Menu temporarily unavailable</h2><p className="mt-2 text-muted-foreground">Please try again shortly or contact the restaurant.</p></div> : items.length === 0 ? <p className="py-16 text-muted-foreground">No dishes found.</p> : categories.filter(c => items.some(i => i.category === c)).map(c => <section key={c} className="mt-9"><h2 className="border-b border-border pb-3 font-brand">{c}</h2><div className="grid gap-x-10 md:grid-cols-2">{items.filter(i => i.category === c).map(i => <article key={i.id} className="border-b border-border py-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="flex items-center gap-2 font-bold"><span aria-label={i.veg ? 'Vegetarian' : 'Non-vegetarian'} className={`size-2 shrink-0 rounded-full ${i.veg ? 'bg-success' : 'bg-destructive'}`} />{i.name}</p>{i.description ? <p className="mt-2 text-sm text-muted-foreground">{i.description}</p> : null}{!i.available ? <p className="mt-2 text-sm text-warning">Currently unavailable</p> : null}</div>{!i.variants?.length ? <span className="shrink-0 font-bold tabular-nums">₹{i.price}</span> : null}</div>{i.variants?.length ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">{i.variants.map(v => <span key={v.id}>{v.name} <strong>₹{v.price}</strong></span>)}</div> : null}{i.hours ? <p className="mt-2 text-xs text-muted-foreground">Served {i.hours.from}–{i.hours.to}</p> : null}</article>)}</div></section>)}
  </main>;
}
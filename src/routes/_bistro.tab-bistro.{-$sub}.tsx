import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, Gift, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tabHead, tabWebsiteQuery } from '@/lib/tab-website';
import cover from '@/assets/photography/bistro-menu.jpg';
import { SILENT_PARAMS } from "@/lib/silent-route";

export const Route = createFileRoute("/_bistro/tab-bistro/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => tabHead('TAB Bistro by XTSY™ — New Shillong', 'Explore TAB Bistro’s menu, plan a visit to New Shillong and enquire about restaurant gift cards.', '/tab-bistro'),
  component: BistroHome,
});
function BistroHome() {
  const { data } = useSuspenseQuery(tabWebsiteQuery);
  return <main>
    <section className="relative isolate flex min-h-[440px] items-end overflow-hidden bg-sidebar text-sidebar-foreground md:min-h-[520px]">
      <img src={data?.branding.cover || cover} alt="Indian dishes, fresh breads and drinks" className="absolute inset-0 -z-20 size-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 -z-10 bg-sidebar/55" />
      <div className="mx-auto w-full max-w-6xl px-5 py-12 md:py-16">
        <p className="mb-4 text-sm font-semibold uppercase">New Shillong · Meghalaya</p>
        <h1 className="font-brand text-6xl leading-none md:text-8xl">TAB BISTRO</h1>
        <p className="mt-4 text-xl md:text-2xl">{data?.branding.tagline || 'Flavour. Food. Fusion.'}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link to="/tab-bistro/menu/{-$sub}">Explore the menu <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="secondary"><Link to="/book/$slug" params={{ slug: 'tab-bistro-qr' }}>Book a table</Link></Button>
        </div>
      </div>
    </section>
    <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-3">
      <div><UtensilsCrossed className="mb-4 size-6 text-primary" /><h2 className="font-brand">A table worth gathering around</h2><p className="mt-3 text-muted-foreground">From something to share to your favourite comfort food. Browse the menu and make it a meal.</p><Link to="/tab-bistro/menu/{-$sub}" className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-primary">Our menu <ArrowRight className="size-4" /></Link></div>
      <div><MapPin className="mb-4 size-6 text-primary" /><h2 className="font-brand">Come by New Shillong</h2><p className="mt-3 text-muted-foreground">{data?.address || 'New Shillong, Meghalaya'}</p><Link to="/tab-bistro/visit/{-$sub}" className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-primary">Plan your visit <ArrowRight className="size-4" /></Link></div>
      <div><Gift className="mb-4 size-6 text-primary" /><h2 className="font-brand">Give a little TAB</h2><p className="mt-3 text-muted-foreground">A birthday, a thank-you, or simply a reason to get together. Ask us about a gift card.</p><Link to="/tab-bistro/gift-cards/{-$sub}" className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-primary">Gift cards <ArrowRight className="size-4" /></Link></div>
    </section>
  </main>;
}
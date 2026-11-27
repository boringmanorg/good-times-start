import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { MapPin, Clock, Phone, Instagram, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TAB_HOURS, tabHead, tabWebsiteQuery } from '@/lib/tab-website';
import { waLink } from '@/lib/marketing-logic';
import { SILENT_PARAMS } from "@/lib/silent-route";

export const Route = createFileRoute("/_bistro/tab-bistro/visit/{-$sub}")({
  params: SILENT_PARAMS, head: () => tabHead('Visit & Opening Hours — TAB Bistro', 'Find TAB Bistro in New Shillong, contact the restaurant and check visiting hours.', '/tab-bistro/visit'), component: BistroVisit });
function BistroVisit() {
  const { data } = useSuspenseQuery(tabWebsiteQuery);
  const phone = data?.branding.whatsapp || data?.phone;
  return <main className="mx-auto min-h-[65vh] max-w-6xl px-5 py-12"><p className="text-sm font-bold uppercase text-primary">New Shillong, Meghalaya</p><h1 className="mt-3 font-brand text-5xl">See you at TAB</h1><div className="mt-10 grid gap-12 md:grid-cols-2">
    <section><MapPin className="mb-4 text-primary" /><h2 className="font-brand">Find us</h2><p className="mt-4 text-muted-foreground">{data?.address || 'New Shillong, Meghalaya'}</p><Button asChild variant="outline" className="mt-5"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`TAB Bistro ${data?.address || 'New Shillong Meghalaya'}`)}`} target="_blank" rel="noreferrer">Open in Google Maps <ArrowUpRight /></a></Button><Button asChild className="ml-0 mt-3 sm:ml-3"><Link to="/book/$slug" params={{ slug: 'tab-bistro-qr' }}>Book a table</Link></Button></section>
    <section><Clock className="mb-4 text-primary" /><h2 className="font-brand">Opening hours</h2><p className="mt-4 text-muted-foreground">{TAB_HOURS || 'Please contact us to confirm today’s opening hours.'}</p>{phone ? <Button asChild className="mt-5"><a href={waLink(phone, 'Hi TAB Bistro, what are your opening hours today?')}><Phone className="size-4" />Ask on WhatsApp</a></Button> : null}</section>
    <section><h2 className="font-brand">Stay in touch</h2><div className="mt-4 flex flex-wrap gap-3">{data?.phone ? <Button variant="outline" asChild><a href={`tel:${data.phone.replace(/[^+\d]/g, '')}`}><Phone />Call TAB Bistro</a></Button> : null}{data?.branding.links?.instagram ? <Button variant="outline" asChild><a href={data.branding.links.instagram} target="_blank" rel="noreferrer"><Instagram />Instagram</a></Button> : null}</div></section>
  </div></main>;
}
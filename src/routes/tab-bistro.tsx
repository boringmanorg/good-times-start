import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { tabWebsiteQuery } from '@/lib/tab-website';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';

export const Route = createFileRoute('/tab-bistro')({
  loader: ({ context }) => context.queryClient.ensureQueryData(tabWebsiteQuery),
  component: BistroLayout,
});
function BistroLayout() {
  const { data } = useSuspenseQuery(tabWebsiteQuery);
  return <div className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Link to="/tab-bistro" className="flex items-center gap-3" aria-label="TAB Bistro home">
          {data?.branding.logo ? <img src={data.branding.logo} alt="TAB Bistro logo" width={48} height={48} className="size-12 object-contain" /> : null}
          <span><span className="font-brand block text-2xl leading-none">TAB BISTRO</span><span className="text-xs text-muted-foreground">by XTSY™ · New Shillong</span></span>
        </Link>
        <nav aria-label="TAB Bistro" className="flex flex-wrap items-center gap-1 text-sm">
          <Button variant="ghost" asChild><Link to="/tab-bistro/menu">Menu</Link></Button>
          <Button variant="ghost" asChild><Link to="/tab-bistro/visit">Visit</Link></Button>
          <Button variant="outline" asChild><Link to="/tab-bistro/gift-cards">Gift cards <ArrowUpRight className="size-4" /></Link></Button>
        </nav>
      </div>
    </header>
    <Outlet />
    <footer className="border-t border-border bg-accent text-accent-foreground">
      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-10 sm:grid-cols-2">
        <div><p className="font-brand text-3xl">TAB BISTRO</p><p className="mt-1 text-sm">Flavour. Food. Fusion. · New Shillong, Meghalaya</p></div>
        <div className="text-sm sm:text-right"><Link to="/xtsy-pos" className="underline underline-offset-4">POS by XTSY™</Link><p className="mt-3">XTSY™ is a trademark of XTSY Ventures Private Limited.</p><p className="mt-1">© {new Date().getFullYear()} XTSY Ventures Private Limited.</p></div>
      </div>
    </footer>
  </div>;
}
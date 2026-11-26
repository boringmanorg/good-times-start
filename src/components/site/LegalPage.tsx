import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo.png";

/** The frame for XTSY POS's policy pages: a plain reading page in the website's look. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-foreground">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5" aria-label="XTSY POS home">
            <img src={logo} alt="" width={30} height={30} className="rounded-[8px]" />
            <span className="font-brand text-[22px] leading-none">XTSY POS</span>
          </Link>
          <nav aria-label="Policies" className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground [&.active]:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground [&.active]:text-foreground">Terms</Link>
            <Link to="/refunds" className="hover:text-foreground [&.active]:text-foreground">Refunds</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-brand text-5xl leading-none md:text-6xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}. XTSY Ventures Private Limited, New Shillong, Meghalaya, India.</p>
        <div className="legal mt-10 max-w-[68ch] space-y-4 leading-relaxed text-[#d6d6db] [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
        <p className="mt-14 border-t border-white/10 pt-6 text-sm text-muted-foreground">Questions about this page: <a href="mailto:admin@xtsy.one" className="text-foreground underline underline-offset-4">admin@xtsy.one</a></p>
      </main>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { SITE_MODELS, STATUS_LABEL } from "@/lib/site-models";
import { cn } from "@/lib/utils";
import { PUBLIC_PLANS } from "@/lib/plans";

/** Lowest Restaurant POS price, from the standby copy of the catalogue (kept in step by plans.test). */
const FROM_PRICE = Math.min(...PUBLIC_PLANS.map((p) => p.price ?? Infinity));
import logo from "@/assets/logo.png";

/*
 * The website's frame in the xtsy.one look: ink announcement bar, cream sticky header, a ticker,
 * an ink closing band and a link-cluster footer. Colours come from .theme-xtsy (cream #FAF7F2,
 * ink #1F2230, crimson #A12444); headings are Staatliches, body Manrope.
 */

export function SiteShell({ children, enquireHref = "#enquire" }: { children: ReactNode; enquireHref?: string }) {
  return (
    <div className="theme-xtsy min-h-screen bg-background text-foreground">
      <AnnouncementBar />
      <SiteHeader enquireHref={enquireHref} />
      <main id="top">{children}</main>
      <SiteFooter />
    </div>
  );
}

function AnnouncementBar() {
  return (
    <div className="bg-[#1F2230] px-4 py-2 text-center text-xs font-semibold text-[#FAF7F2] sm:text-[13px]">
      <span>DPIIT-recognised startup</span><span className="mx-2 opacity-50" aria-hidden="true">·</span>
      <span>Restaurant POS from ₹{FROM_PRICE.toLocaleString("en-IN")} a month</span><span className="mx-2 hidden opacity-50 sm:inline" aria-hidden="true">·</span>
      <span className="hidden sm:inline">Support 7 days a week</span>
    </div>
  );
}

function SiteHeader({ enquireHref }: { enquireHref: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-[#1F2230]/10 bg-[#FAF7F2]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5" aria-label="XTSY POS home">
          <img src={logo} alt="" width={34} height={34} className="rounded-[9px]" />
          <span><span className="font-brand block text-[24px] leading-none">XTSY POS</span><span className="block text-[10.5px] font-bold text-primary">POS by XTSY™</span></span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold lg:flex" aria-label="POS models">
          {SITE_MODELS.map((m) => (
            <a key={m.id} href={m.path} className="hover:text-primary">{m.short}{m.status !== "live" ? <span className="ml-1 align-top text-[10px] font-bold text-primary">{m.status === "pilot" ? "Pilot" : "Soon"}</span> : null}</a>
          ))}
          <a href="/#plans" className="hover:text-primary">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <a href={enquireHref} className="rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground hover:opacity-90">Start a plan</a>
          <button type="button" className="grid size-10 place-items-center rounded-full ring-1 ring-[#1F2230]/15 lg:hidden" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t border-[#1F2230]/10 px-4 pb-4 lg:hidden" aria-label="POS models">
          {SITE_MODELS.map((m) => (
            <a key={m.id} href={m.path} className="flex items-center justify-between border-b border-[#1F2230]/10 py-3 font-semibold" onClick={() => setOpen(false)}>
              {m.name}<span className="text-xs font-bold text-primary">{STATUS_LABEL[m.status]}</span>
            </a>
          ))}
          <a href="/#plans" className="block py-3 font-semibold" onClick={() => setOpen(false)}>Pricing</a>
        </nav>
      ) : null}
    </header>
  );
}

/** A slow strip of short words, as on xtsy.one. Stops for reduced motion. */
export function Ticker({ words }: { words: string[] }) {
  const line = words.join("  ·  ");
  return (
    <div className="overflow-hidden border-y border-[#1F2230]/10 bg-[#F1EBE1] py-3 text-sm font-bold" aria-label={words.join(", ")}>
      <div className="xt-ticker flex w-max gap-8 whitespace-nowrap motion-reduce:animate-none" aria-hidden="true">
        <span>{line}  ·</span><span>{line}  ·</span>
      </div>
    </div>
  );
}

export function SiteSection({ id, eyebrow, title, intro, children, tone = "plain" }: { id?: string; eyebrow?: string; title: string; intro?: string | undefined; children: ReactNode; tone?: "plain" | "sand" | "ink" }) {
  return (
    <section id={id} className={cn("scroll-mt-24 px-4 py-16 md:py-24", tone === "sand" && "bg-[#F1EBE1]", tone === "ink" && "bg-[#1F2230] text-[#FAF7F2]")}>
      <div className="mx-auto max-w-6xl">
        {eyebrow ? <p className={cn("xt-eyebrow", tone === "ink" ? "text-[#E8B4C0]" : "text-primary")}>{eyebrow}</p> : null}
        <h2 className="mt-1 text-[2.4rem] leading-[0.95] md:text-6xl">{title}</h2>
        {intro ? <p className={cn("mt-4 max-w-[60ch]", tone === "ink" ? "text-[#FAF7F2]/75" : "text-muted-foreground")}>{intro}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** The ink band before the footer. */
export function ClosingCta({ title, text, href, label }: { title: string; text: string; href: string; label: string }) {
  return (
    <section className="bg-[#1F2230] px-4 py-16 text-[#FAF7F2] md:py-20">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-[2.6rem] leading-[0.95] md:text-6xl">{title}</h2>
          <p className="mt-3 max-w-[48ch] text-[#FAF7F2]/75">{text}</p>
        </div>
        <a href={href} className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-primary px-7 font-extrabold text-primary-foreground hover:opacity-90">{label}</a>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[#1F2230]/10 bg-[#FAF7F2]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-brand text-3xl leading-none">XTSY POS</p>
          <p className="mt-2 font-bold text-primary">Bill. Book. Check in. Repeat.</p>
          <p className="mt-4 max-w-[34ch] text-muted-foreground">Made by XTSY Ventures Private Limited, a DPIIT-recognised startup from Coimbatore, Tamil Nadu.</p>
        </div>
        <div>
          <p className="font-bold">POS models</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            {SITE_MODELS.map((m) => <li key={m.id}><a href={m.path} className="hover:text-foreground">{m.name}</a></li>)}
          </ul>
        </div>
        <div>
          <p className="font-bold">XTSY</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><a href="/#plans" className="hover:text-foreground">Pricing</a></li>
            <li><a href="/#status" className="hover:text-foreground">What's live</a></li>
            <li><Link to="/tab-bistro" className="hover:text-foreground">TAB Bistro by XTSY</Link></li>
            <li><a href="https://xtsy.one" target="_blank" rel="noreferrer" className="hover:text-foreground">xtsy.one</a></li>
          </ul>
        </div>
        <div>
          <p className="font-bold">Help</p>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><a href="mailto:admin@xtsy.one" className="hover:text-foreground">admin@xtsy.one</a></li>
            <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
            <li><Link to="/terms" className="hover:text-foreground">Terms of service</Link></li>
            <li><Link to="/refunds" className="hover:text-foreground">Refunds and cancellation</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#1F2230]/10 px-4 py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} XTSY Ventures Private Limited · Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by XTSY</div>
    </footer>
  );
}

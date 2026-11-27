import type { ReactNode } from "react";
import { SiteShell } from "./SiteChrome";

/** The frame for XTSY POS's policy pages: a plain reading page inside the website's xtsy.one look. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <SiteShell enquireHref="/#enquire">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="xt-eyebrow text-primary">Policies</p>
        <h1 className="mt-1 text-5xl leading-none md:text-6xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}. XTSY Ventures Private Limited, Coimbatore, Tamil Nadu, India.</p>
        <div className="legal mt-10 max-w-[68ch] space-y-4 leading-relaxed text-[#1F2230]/85 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:font-sans [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:normal-case [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
        <p className="mt-14 border-t border-[#1F2230]/10 pt-6 text-sm text-muted-foreground">Questions about this page: <a href="mailto:admin@xtsy.one" className="font-semibold text-primary underline underline-offset-4">admin@xtsy.one</a></p>
      </div>
    </SiteShell>
  );
}

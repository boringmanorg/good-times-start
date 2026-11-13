import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Gauge, Play, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auditHtml, pageSpeedUrl, readPageSpeed, type PageSpeed } from "@/lib/seo-audit";
import { MARKETING_HOSTS, SITE_PATH, siteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { Failed, Loading, Panel, Stat } from "./ConsoleBits";

async function fetchText(path: string): Promise<string | null> {
  try { const r = await fetch(path, { cache: "no-store" }); return r.ok ? await r.text() : null; } catch { return null; }
}

/** SEO insights for the XTSY POS website: live on-page audit, keyword coverage, Lighthouse, and the search consoles. */
export function ConsoleSeo() {
  const audit = useQuery({
    queryKey: ["console", "seo-audit"],
    queryFn: async () => {
      const [html, robots, sitemap] = await Promise.all([fetchText("/"), fetchText("/robots.txt"), fetchText("/sitemap.xml")]);
      if (!html) throw new Error("Couldn't load the website page to check it.");
      return auditHtml(html, { robots, sitemap });
    },
    staleTime: 5 * 60_000,
  });
  const url = siteUrl();
  const domain = MARKETING_HOSTS[0];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-brand text-3xl">SEO insights</h1>
        <p className="text-sm text-muted-foreground">For the XTSY POS website · <a href={url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{url}</a>{domain ? "" : " (preview address until your domain is connected)"}</p>
      </div>

      {audit.isLoading ? <Loading what="the on-page audit" /> : audit.error || !audit.data ? <Failed error={audit.error} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="On-page SEO score" value={`${audit.data.score} / 100`} tone={audit.data.score >= 90 ? "good" : audit.data.score >= 70 ? "warn" : "bad"} />
            <Stat label="Words on the page" value={audit.data.words.toLocaleString("en-IN")} />
            <Stat label="Sections (H2)" value={audit.data.headings.filter((h) => h.level === 2).length} />
            <Stat label="Structured data" value={audit.data.schemaTypes.length} note={audit.data.schemaTypes.join(", ") || "none"} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="On-page checks">
              <ul className="space-y-2 text-sm">
                {audit.data.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    {c.level === "pass" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : c.level === "warn" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                    <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Keyword coverage">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Phrase</th><th className="text-right">Uses</th><th className="text-center">Title</th><th className="text-center">H1</th><th className="text-center">Description</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {audit.data.keywords.map((k) => (
                    <tr key={k.phrase}><td className="py-1.5">{k.phrase}</td><td className={cn("text-right tabular-nums", !k.count && "text-warning")}>{k.count}</td>
                      {[k.inTitle, k.inH1, k.inDescription].map((v, i) => <td key={i} className="text-center">{v ? "✓" : "·"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page outline</h3>
              <ul className="mt-1 space-y-0.5 text-xs">{audit.data.headings.map((h, i) => <li key={i} style={{ paddingLeft: `${(h.level - 1) * 12}px` }} className={h.level === 1 ? "font-semibold" : "text-muted-foreground"}>H{h.level} · {h.text}</li>)}</ul>
            </Panel>
          </div>
        </>
      )}

      <PageSpeedPanel url={url} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Source title="Google Search Console" href="https://search.google.com/search-console" status={domain ? "Verify the domain, then submit the sitemap" : "Needs the website's own domain"}
          steps={["Connect the domain to this project and add it in site-config.ts", "Add it as a Domain property in Search Console (DNS TXT record)", `Submit ${domain ? `https://${domain}/sitemap.xml` : "the sitemap"}`, "Clicks, queries, rankings and indexing appear within a few days"]} />
        <Source title="Bing Webmaster Tools" href="https://www.bing.com/webmasters" status="Import straight from Search Console"
          steps={["Sign in and choose Import from Google Search Console", "Bing, DuckDuckGo and Yahoo results then report here", "Submit the same sitemap"]} />
        <Source title="Semrush" href="https://www.semrush.com/analytics/overview/" status="Paid API plan for in-console data"
          steps={["Track keywords like “restaurant billing software India”", "Compare with Petpooja, POSist and Zoho POS", "Backlinks and site audit for the domain"]} />
      </div>
    </div>
  );
}

function PageSpeedPanel({ url }: { url: string }) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [state, setState] = useState<{ busy: boolean; data: PageSpeed | null; error: string }>({ busy: false, data: null, error: "" });
  const run = async () => {
    setState({ busy: true, data: null, error: "" });
    try {
      const res = await fetch(pageSpeedUrl(url, strategy));
      const data = readPageSpeed(await res.json());
      setState({ busy: false, data, error: data ? "" : "Google couldn't test the page. It may be rate-limited: try again in a minute." });
    } catch { setState({ busy: false, data: null, error: "Couldn't reach Google PageSpeed. Check the internet." }); }
  };
  const tone = (n: number): "good" | "warn" | "bad" => (n >= 90 ? "good" : n >= 50 ? "warn" : "bad");
  return (
    <Panel title="Google Lighthouse (PageSpeed Insights)" action={
      <div className="flex items-center gap-2">
        <select aria-label="Device" value={strategy} onChange={(e) => setStrategy(e.target.value as "mobile" | "desktop")} className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select>
        <Button size="sm" disabled={state.busy} onClick={() => void run()}>{state.busy ? <Gauge className="animate-spin" /> : <Play />}{state.busy ? "Testing (≈30 s)…" : "Run test"}</Button>
      </div>}>
      {state.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Performance" value={state.data.performance} tone={tone(state.data.performance)} />
          <Stat label="SEO" value={state.data.seo} tone={tone(state.data.seo)} />
          <Stat label="Accessibility" value={state.data.accessibility} tone={tone(state.data.accessibility)} />
          <Stat label="Best practices" value={state.data.bestPractices} tone={tone(state.data.bestPractices)} />
          <Stat label="Largest paint (LCP)" value={state.data.lcp} />
          <Stat label="Layout shift (CLS)" value={state.data.cls} />
          <Stat label="Blocking time (TBT)" value={state.data.tbt} />
          <Stat label="First paint (FCP)" value={state.data.fcp} />
        </div>
      ) : <p className="text-sm text-muted-foreground">{state.error || "Runs Google's Lighthouse on the live website: speed, SEO, accessibility and Core Web Vitals."}</p>}
    </Panel>
  );
}

function Source({ title, href, status, steps }: { title: string; href: string; status: string; steps: string[] }) {
  return (
    <Panel title={title} action={<a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Open<ExternalLink className="size-3.5" /></a>}>
      <p className="-mt-1 text-xs font-semibold text-warning">{status}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
    </Panel>
  );
}

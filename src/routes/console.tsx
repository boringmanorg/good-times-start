import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Activity, BarChart3, Building2, Gauge, Layers, LogOut, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { whoami } from "@/lib/console-api";
import { ConsoleOverview } from "@/components/console/ConsoleOverview";
import { ConsoleRestaurants } from "@/components/console/ConsoleRestaurants";
import { ConsolePlans } from "@/components/console/ConsolePlans";
import { ConsoleInfra } from "@/components/console/ConsoleInfra";
import { ConsoleSeo } from "@/components/console/ConsoleSeo";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

/**
 * XTSY POS super admin console: its own sign-in, separate from the restaurant apps and never
 * linked from them or from the website. Only accounts listed as platform admins get past the door;
 * the cloud checks that on every call too.
 */
export const Route = createFileRoute("/console")({
  head: () => ({ meta: [{ title: "XTSY POS · Super admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ConsolePage,
});

type Tab = "overview" | "restaurants" | "plans" | "infra" | "seo";
const TABS: { v: Tab; l: string; icon: typeof Activity }[] = [
  { v: "overview", l: "Overview", icon: Gauge },
  { v: "restaurants", l: "Restaurants", icon: Building2 },
  { v: "plans", l: "Plans", icon: Layers },
  { v: "infra", l: "Infra & backend", icon: Activity },
  { v: "seo", l: "SEO insights", icon: Search },
];

function ConsolePage() {
  const [session, setSession] = useState<"checking" | "out" | "in">("checking");
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session ? "in" : "out"));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ? "in" : "out"));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === "checking") return <Splash />;
  if (session === "out") return <ConsoleSignIn />;
  return <ConsoleGate />;
}

function Splash() {
  return <div className="grid min-h-screen place-items-center bg-background"><img src={logo} alt="XTSY POS" width={44} height={44} className="rounded-xl opacity-80" /></div>;
}

function ConsoleSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMessage("");
    const id = email.trim().toLowerCase();
    // The super admin signs in with a real email (admin@xtsy.one); restaurant short names never apply here.
    if (!id.includes("@")) { setMessage("Sign in with the super admin email address."); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: id, password });
    setBusy(false);
    if (error) setMessage(/invalid/i.test(error.message) ? "Wrong sign-in or password." : "Couldn't sign in. Check the internet and try again.");
  };
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" width={36} height={36} className="rounded-[10px]" />
          <div><p className="font-brand text-2xl leading-none">XTSY POS</p><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Super admin</p></div>
        </div>
        <label className="mt-6 block text-sm font-medium">Email
          <input type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base" />
        </label>
        <label className="mt-3 block text-sm font-medium">Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base" />
        </label>
        {message ? <p role="alert" className="mt-3 text-sm text-destructive">{message}</p> : null}
        <Button type="submit" className="mt-5 h-11 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">Restricted area. Restaurant staff sign in from their own app.</p>
      </form>
    </main>
  );
}

function ConsoleGate() {
  const me = useQuery({ queryKey: ["console", "whoami"], queryFn: whoami, staleTime: 60_000, retry: 1 });
  const signOut = async () => { await supabase.auth.signOut(); };
  if (me.isLoading) return <Splash />;
  if (me.error || !me.data?.superAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div className="max-w-sm text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" />
          <h1 className="mt-3 text-xl font-bold">Not a super admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">{me.error instanceof Error ? me.error.message : `${me.data?.email ?? "This account"} can't open the XTSY POS console.`}</p>
          <Button variant="outline" className="mt-5" onClick={() => void signOut()}><LogOut />Sign out</Button>
        </div>
      </main>
    );
  }
  return <ConsoleShell email={me.data.email ?? ""} onSignOut={signOut} />;
}

function ConsoleShell({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const h = window.location.hash.slice(1) as Tab;
    return TABS.some((t) => t.v === h) ? h : "overview";
  });
  const choose = (t: Tab) => { setTab(t); try { window.history.replaceState(null, "", `#${t}`); } catch { /* ignore */ } };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass-dark sticky top-0 z-20 border-b border-border px-4 pt-[max(0.625rem,env(safe-area-inset-top))] lg:px-8">
        <div className="flex items-center justify-between gap-3 pb-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={logo} alt="" width={30} height={30} className="rounded-[8px]" />
            <div className="min-w-0"><p className="font-brand truncate text-[19px] leading-tight">XTSY POS Console</p><p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">Super admin · {email}</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" aria-label="Refresh" onClick={() => void queryClient.invalidateQueries({ queryKey: ["console"] })}><RefreshCw /><span className="hidden sm:inline">Refresh</span></Button>
            <Button size="icon" variant="ghost" aria-label="Sign out" title="Sign out" onClick={() => void onSignOut()}><LogOut /></Button>
          </div>
        </div>
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:-mx-8 lg:px-8" aria-label="Console">
          {TABS.map(({ v, l, icon: Icon }) => (
            <button key={v} type="button" onClick={() => choose(v)} aria-current={tab === v ? "page" : undefined}
              className={cn("relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-semibold", tab === v ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" />{l}
              {tab === v ? <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t bg-primary" aria-hidden="true" /> : null}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 lg:p-8">
        {tab === "overview" ? <ConsoleOverview /> : null}
        {tab === "restaurants" ? <ConsoleRestaurants /> : null}
        {tab === "plans" ? <ConsolePlans /> : null}
        {tab === "infra" ? <ConsoleInfra /> : null}
        {tab === "seo" ? <ConsoleSeo /> : null}
      </main>
      <footer className="px-4 pb-8 text-center text-xs text-muted-foreground"><BarChart3 className="mr-1 inline size-3.5" />XTSY POS · Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by XTSY</footer>
    </div>
  );
}

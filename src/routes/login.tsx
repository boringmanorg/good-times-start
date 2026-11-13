import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LayoutDashboard, Send, Store, Tablet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { setAppMode, syncAppModeFromUrl, useChosenApp } from "@/lib/app-mode";
import { useStaff } from "@/lib/staff";
import { APPS, LOGINS, appsFor, emailFromInput, loginForEmail, passwordProblem, type AppKind, type LoginId } from "@/lib/staff-login-logic";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — XTSY POS" },
      { name: "description", content: "Sign in to XTSY POS: POS Manager, POS Billdesk and Waiter Pro." },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — XTSY POS" }, { property: "og:description", content: "Sign in to XTSY POS: POS Manager, POS Billdesk and Waiter Pro." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },],
  }),
  component: AuthPage,
});

const APP_ICONS: Record<AppKind, typeof Store> = { manager: LayoutDashboard, pos: Store, waiter: Tablet };
const input = "mt-1 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-base";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useStaff();
  useEffect(() => { syncAppModeFromUrl(); }, []);
  const chosen = useChosenApp();
  const [submitting, setSubmitting] = useState(false);
  // Already signed in on this device: go straight to the app instead of asking again.
  useEffect(() => {
    if (loading || !user || submitting) return;
    const own = appsFor(user.login, user.role === "unknown" ? null : user.role);
    const target: AppKind = chosen && own.includes(chosen) ? chosen : own[0] ?? chosen ?? "manager";
    setAppMode(target);
    void navigate({ to: user.role === "kitchen" ? "/tables" : APPS[target].home, replace: true });
  }, [loading, user, submitting, chosen, navigate]);
  const app: AppKind | null = chosen;
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Each app suggests its own login; anyone can type another.
  useEffect(() => { if (app && !login) setLogin(LOGINS[APPS[app].login].email); }, [app, login]);

  const pickApp = (a: AppKind) => {
    // Each installed app has a direct, shareable sign-in URL.
    try { window.sessionStorage.removeItem("xtsy-app"); } catch { /* ignore */ }
    window.location.assign(`/login?app=${a}`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = emailFromInput(login);
    if (!email || !password) return;
    setBusy(true);
    setSubmitting(true);
    setMessage("");
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setMessage(/invalid login credentials/i.test(result.error.message) ? "That login or password isn't right." : /fetch|network/i.test(result.error.message) ? "No internet. The first sign-in on a device needs a connection." : result.error.message);
        return;
      }
      const internal = loginForEmail(email);
      const own = appsFor(internal, null);
      if (app && internal && !own.includes(app)) {
        await supabase.auth.signOut();
        setMessage(`${LOGINS[internal].label} uses ${APPS[own[0] as AppKind].name}, not ${APPS[app].name}.`);
        return;
      }
      const target = app ?? (internal ? LOGINS[internal].app : "manager");
      setAppMode(target);
      // Know who signed in before opening the app, so it opens on the first try.
      await refresh();
      await navigate({ to: APPS[target].home, replace: true });
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  };

  const AppIcon = app ? APP_ICONS[app] : Store;
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1fr_minmax(26rem,34rem)]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3"><img src={logo} alt="" width={36} height={36} className="rounded-[10px]" /><span><span className="font-brand block text-2xl leading-none">XTSY POS</span><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">POS by XTSY</span></span></div>
        <div className="max-w-md">
          <p className="font-brand text-5xl leading-[1.02]">{app ? APPS[app].name : "Billing your restaurant will love."}</p>
          <p className="mt-4 text-sidebar-foreground/75">{app ? APPS[app].for : "POS Manager for the owner, POS Billdesk for the counter, Waiter Pro for the floor. Orders flow between them live, even offline."}</p>
        </div>
        <div className="flex items-center justify-between text-xs text-sidebar-foreground/60"><span>Logins are managed by your admin.</span><span>Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by XTSY</span></div>
      </aside>

      <div className="flex items-center justify-center p-4">
        <section className="w-full max-w-sm">
          <div className="flex items-center gap-3 lg:hidden"><img src={logo} alt="" width={36} height={36} className="rounded-[10px]" /><span><span className="font-brand block text-xl leading-none">XTSY POS</span><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">POS by XTSY</span></span></div>

          <>
            <div className="mt-6 flex items-center gap-3 lg:mt-0">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary-tint text-primary"><AppIcon className="size-5" /></span>
              <div>
                <h1 className="text-2xl font-bold leading-tight">Sign in</h1>
                <p className="text-sm text-muted-foreground">{app ? APPS[app].name : "Choose your screen"}</p>
              </div>
            </div>

            {!app ? (
              <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Screen">
                {(Object.keys(APPS) as AppKind[]).map((a) => {
                  const Icon = APP_ICONS[a];
                  return (
                    <button key={a} type="button" role="radio" aria-checked={false} onClick={() => pickApp(a)}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left hover:border-primary">
                      <Icon className="size-5 shrink-0 text-primary" />
                      <span><span className="block font-semibold">{APPS[a].name}</span><span className="block text-xs text-muted-foreground">{APPS[a].for}</span></span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <form className="mt-6 space-y-3" onSubmit={(event) => void submit(event)}>
                <label className="block text-sm font-medium">Login
                  <input autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={120} value={login} onChange={(e) => setLogin(e.target.value)} className={input} />
                </label>
                <label className="block text-sm font-medium">Password
                  <span className="relative block">
                    <input autoComplete="current-password" type={show ? "text" : "password"} required maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus className={cn(input, "pr-16")} />
                    <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary">{show ? "Hide" : "Show"}</button>
                  </span>
                </label>
                {message ? <p role="status" className={cn("text-sm", /changed/.test(message) ? "text-success" : "text-destructive")}>{message}</p> : null}
                <Button disabled={busy || !login.trim() || !password} className="h-12 w-full text-base" type="submit">{busy ? "Signing in…" : "Sign in"}</Button>
                <div className="flex items-center justify-between pt-1">
                  <button type="button" className="text-sm font-semibold text-primary" onClick={() => setMessage("Passwords are managed by XTSY. Ask your admin; the admin resets them through XTSY support.")}>Forgot password?</button>
                  <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => { try { window.sessionStorage.removeItem("xtsy-app"); } catch { /* ignore */ } window.location.assign("/login"); }}>Other screen</button>
                </div>
              </form>
            )}
            <p className="mt-8 text-center text-xs text-muted-foreground">Once signed in, this device stays signed in and keeps working offline.</p>
            <p className="mt-3 text-center text-xs text-muted-foreground lg:hidden">Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by XTSY</p>
          </>
        </section>
      </div>
    </main>
  );
}

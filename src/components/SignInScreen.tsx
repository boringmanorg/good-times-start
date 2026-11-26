import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { BedDouble, LayoutDashboard, Store, Tablet, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { setAppMode, syncAppModeFromUrl, useChosenApp } from "@/lib/app-mode";
import { useStaff } from "@/lib/staff";
import { APPS, LOGINS, appsFor, emailFromInput, loginForEmail, type AppKind } from "@/lib/staff-login-logic";
import { DOORS, doorOf, homeFor, rememberDoor, wrongDoorMessage, type Door } from "@/lib/login-doors";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const APP_ICONS: Record<Door, Record<AppKind, typeof Store>> = {
  restaurant: { manager: LayoutDashboard, pos: Store, waiter: Tablet },
  stay: { manager: BedDouble, pos: Users, waiter: Tablet },
};
const input = "mt-1 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-base";

/** The products of the outlets a just-signed-in person belongs to. */
async function productsOf(userId: string): Promise<(string | null)[]> {
  const { data, error } = await supabase.from("restaurant_members").select("restaurants(branding)").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const b = (row as { restaurants?: { branding?: unknown } | null }).restaurants?.branding;
    const p = b && typeof b === "object" ? (b as { product?: unknown }).product : undefined;
    return typeof p === "string" ? p : null;
  });
}

/** One sign-in page per XTSY POS model; `door` picks the product, its apps and its look. */
export function SignInScreen({ door }: { door: Door }) {
  const info = DOORS[door];
  const stay = door === "stay";
  const navigate = useNavigate();
  const { user, loading, refresh } = useStaff();
  useEffect(() => { syncAppModeFromUrl(); }, []);
  const picked = useChosenApp();
  const chosen: AppKind | null = picked && info.apps.includes(picked) ? picked : null;
  const [submitting, setSubmitting] = useState(false);
  const nameOf = (a: AppKind) => info.appNames[a] ?? { name: APPS[a].name, for: APPS[a].for };

  // Already signed in on this device: open the app, at the right door for the outlet's product.
  useEffect(() => {
    if (loading || !user || submitting) return;
    const own = doorOf(user.product);
    if (user.restaurantId && own !== door) { window.location.replace(DOORS[own].path); return; }
    const apps = appsFor(user.login, user.role === "unknown" ? null : user.role).filter((a) => info.apps.includes(a));
    const target: AppKind = chosen && apps.includes(chosen) ? chosen : apps[0] ?? chosen ?? "manager";
    setAppMode(target);
    rememberDoor(door);
    void navigate({ to: user.role === "kitchen" && !stay ? "/tables" : homeFor(door, target), replace: true });
  }, [loading, user, submitting, chosen, navigate, door, info.apps, stay]);

  const app = chosen;
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Restaurant apps suggest their built-in login; stay logins are per property, so none is guessed.
  useEffect(() => { if (!stay && app && !login) setLogin(LOGINS[APPS[app].login].email); }, [stay, app, login]);

  const pickApp = (a: AppKind) => {
    try { window.sessionStorage.removeItem("xtsy-app"); } catch { /* ignore */ }
    window.location.assign(`${info.path}?app=${a}`);
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
      // Each product has its own door: a restaurant login can't open the property app, and back.
      const products = await productsOf(result.data.user.id).catch(() => null);
      const wrong = products ? wrongDoorMessage(door, products) : null;
      if (wrong) { await supabase.auth.signOut(); setMessage(wrong); return; }
      const internal = loginForEmail(email);
      const own = appsFor(internal, null);
      if (app && internal && !own.includes(app)) {
        await supabase.auth.signOut();
        setMessage(`${LOGINS[internal].label} uses ${nameOf(own[0] as AppKind).name}, not ${nameOf(app).name}.`);
        return;
      }
      const target = app ?? (internal ? LOGINS[internal].app : "manager");
      setAppMode(target);
      rememberDoor(door);
      await refresh();
      await navigate({ to: homeFor(door, target), replace: true });
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  };

  const AppIcon = app ? APP_ICONS[door][app] : stay ? BedDouble : Store;
  const brand = stay ? "Hostel & Hotel POS" : "XTSY POS";
  const sub = stay ? "PMS + channel manager by XTSY" : "POS by XTSY";
  return (
    <main className={cn("grid min-h-screen bg-background lg:grid-cols-[1fr_minmax(26rem,34rem)]", stay && "theme-xtsy")}>
      <aside className={cn("hidden flex-col justify-between p-10 lg:flex", stay ? "bg-[#1F2230] text-[#FAF7F2]" : "bg-sidebar text-sidebar-foreground")}>
        <div className="flex items-center gap-3"><img src={logo} alt="" width={36} height={36} className="rounded-[10px]" /><span><span className="font-brand block text-2xl leading-none">{brand}</span><span className={cn("text-[11px] font-semibold tracking-[0.06em]", stay ? "text-[#E8B4C0]" : "text-primary")}>{sub}</span></span></div>
        <div className="max-w-md">
          <p className="font-brand text-5xl leading-[1.02]">{app ? nameOf(app).name : info.pitch}</p>
          <p className="mt-4 opacity-75">{app ? nameOf(app).for : info.pitchBody}</p>
        </div>
        <div className="flex items-center justify-between text-xs opacity-60">
          <span>{stay ? <>Running a restaurant? <a className="underline" href={DOORS.restaurant.path}>Restaurant POS sign-in</a></> : <>Running a hostel or hotel? <a className="underline" href={DOORS.stay.path}>Hostel & Hotel POS sign-in</a></>}</span>
          <span>Made with <span role="img" aria-label="love" className="text-[#ff375f]">❤️</span> by XTSY</span>
        </div>
      </aside>

      <div className="flex items-center justify-center p-4">
        <section className="w-full max-w-sm">
          <div className="flex items-center gap-3 lg:hidden"><img src={logo} alt="" width={36} height={36} className="rounded-[10px]" /><span><span className="font-brand block text-xl leading-none">{brand}</span><span className="text-[10px] font-semibold tracking-[0.06em] text-primary">{sub}</span></span></div>

          <div className="mt-6 flex items-center gap-3 lg:mt-0">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary-tint text-primary"><AppIcon className="size-5" /></span>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Sign in</h1>
              <p className="text-sm text-muted-foreground">{app ? nameOf(app).name : `${info.name} · choose your screen`}</p>
            </div>
          </div>

          {!app ? (
            <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Screen">
              {info.apps.map((a) => {
                const Icon = APP_ICONS[door][a];
                return (
                  <button key={a} type="button" role="radio" aria-checked={false} onClick={() => pickApp(a)}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left hover:border-primary">
                    <Icon className="size-5 shrink-0 text-primary" />
                    <span><span className="block font-semibold">{nameOf(a).name}</span><span className="block text-xs text-muted-foreground">{nameOf(a).for}</span></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <form className="mt-6 space-y-3" onSubmit={(event) => void submit(event)}>
              <label className="block text-sm font-medium">Login
                <input autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={120} value={login} onChange={(e) => setLogin(e.target.value)} placeholder={stay ? "admin@yourproperty.pos" : undefined} className={input} />
              </label>
              <label className="block text-sm font-medium">Password
                <span className="relative block">
                  <input autoComplete="current-password" type={show ? "text" : "password"} required maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus className={cn(input, "pr-16")} />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary">{show ? "Hide" : "Show"}</button>
                </span>
              </label>
              {message ? <p role="status" className="text-sm text-destructive">{message}</p> : null}
              <Button disabled={busy || !login.trim() || !password} className="h-12 w-full text-base" type="submit">{busy ? "Signing in…" : "Sign in"}</Button>
              <div className="flex items-center justify-between pt-1">
                <button type="button" className="text-sm font-semibold text-primary" onClick={() => setMessage("Passwords are managed by XTSY. Ask your admin; the admin resets them through XTSY support.")}>Forgot password?</button>
                <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => { try { window.sessionStorage.removeItem("xtsy-app"); } catch { /* ignore */ } window.location.assign(info.path); }}>Other screen</button>
              </div>
            </form>
          )}
          <p className="mt-8 text-center text-xs text-muted-foreground">Once signed in, this device stays signed in and keeps working offline.</p>
          <p className="mt-3 text-center text-xs text-muted-foreground lg:hidden">
            {stay ? <a className="underline" href={DOORS.restaurant.path}>Restaurant POS sign-in</a> : <a className="underline" href={DOORS.stay.path}>Hostel & Hotel POS sign-in</a>}
          </p>
        </section>
      </div>
    </main>
  );
}

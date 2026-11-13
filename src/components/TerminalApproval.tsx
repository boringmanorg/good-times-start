import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut, MonitorSmartphone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { APPS, DEVICE_LABELS, type AppKind, type DeviceKind } from "@/lib/staff-login-logic";
import { approveThisTerminal, getDeviceId, loadTerminals, touchTerminal, unnamedTerminal, updateTerminal } from "@/lib/terminal-actions";
import logo from "@/assets/logo.png";

/*
 * A device seen for the first time waits for the admin. Two ways through:
 *  - the admin is here: they name the terminal and type the 60-second admin code (POS Manager →
 *    key button), checked in the cloud;
 *  - the admin is elsewhere: they approve it from POS Manager → Settings → Terminals, and this
 *    screen notices within a few seconds.
 */

const suggested = (app: AppKind) => (app === "pos" ? "Counter" : app === "waiter" ? "Waiter tablet" : "Manager phone");

export function TerminalWaiting({ restaurantId, app, device }: { restaurantId: string; app: AppKind; device: DeviceKind }) {
  const [name, setName] = useState(suggested(app));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Remote approval: check in every 8 seconds; the status store moves this screen on by itself.
  useEffect(() => {
    const timer = window.setInterval(() => void touchTerminal(restaurantId, app, device), 8_000);
    return () => window.clearInterval(timer);
  }, [restaurantId, app, device]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (name.trim().length < 2) { setMessage("Give this terminal a name, e.g. Counter 2."); return; }
    if (!/^\d{6}$/.test(code.replace(/\D/g, ""))) { setMessage("Type the 6-digit admin code."); return; }
    setBusy(true);
    try {
      const status = await approveThisTerminal(restaurantId, name, code);
      toast.success(status === "active" ? `${name.trim()} is approved and ready.` : "Approved, but the plan has no free place for this app. The admin can release an old device.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Couldn't approve. Check the internet."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    await queryClient.cancelQueries(); queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/login", replace: true });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" width={36} height={36} className="rounded-[10px]" />
          <div><p className="font-brand text-2xl leading-none">New terminal</p><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{APPS[app].name} · {DEVICE_LABELS[device]}</p></div>
        </div>
        <p className="mt-5 flex gap-2 rounded-xl bg-primary-tint/50 p-3 text-sm"><MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-primary" />
          This device is new, so the admin approves it before it can be used. Name it, then ask the admin for the 60-second admin code (POS Manager → key button at the top).</p>
        <label className="mt-5 block text-sm font-medium">Terminal name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className="mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base" />
        </label>
        <label className="mt-3 block text-sm font-medium"><KeyRound className="mr-1 inline size-3.5" />Admin code
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 font-mono text-xl tracking-[0.4em]" />
        </label>
        {message ? <p role="alert" className="mt-3 text-sm text-destructive">{message}</p> : null}
        <Button type="submit" className="mt-5 h-11 w-full" disabled={busy}>{busy ? "Approving…" : "Approve this terminal"}</Button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><RefreshCw className="size-3 animate-spin [animation-duration:3s]" />
          Or the admin can approve it from POS Manager → Settings → Terminals; this screen moves on by itself.</p>
        <button type="button" onClick={() => void signOut()} className="mx-auto mt-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><LogOut className="size-4" />Sign in with another login</button>
      </form>
    </main>
  );
}

/** The admin's own new device is approved at once; it just gets a name (asked once, skippable). */
export function NameThisTerminal({ restaurantId, app }: { restaurantId: string; app: AppKind }) {
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState(suggested(app));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const key = "xtsy-terminal-named";
    try { if (window.localStorage.getItem(key)) return; } catch { return; }
    void (async () => {
      try {
        const [id, all] = await Promise.all([getDeviceId(), loadTerminals(restaurantId)]);
        const mine = all.find((t) => t.device_id === id);
        if (!live || !mine) return;
        if (!unnamedTerminal(mine.description)) { try { window.localStorage.setItem(key, "1"); } catch { /* ignore */ } return; }
        setDeviceId(id); setOpen(true);
      } catch { /* offline: ask another time */ }
    })();
    return () => { live = false; };
  }, [restaurantId]);
  if (!open) return null;
  const done = () => { try { window.localStorage.setItem("xtsy-terminal-named", "1"); } catch { /* ignore */ } setOpen(false); };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    try { await updateTerminal(restaurantId, deviceId, { description: name.trim().slice(0, 60) }); toast.success(`This terminal is now "${name.trim()}"`); done(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
    finally { setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Name this terminal" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form onSubmit={(e) => void save(e)} className="w-full max-w-sm rounded-2xl border border-border bg-card p-5">
        <p className="font-brand text-xl">Name this terminal</p>
        <p className="mt-1 text-sm text-muted-foreground">So you can tell your devices apart in Settings → Terminals, alerts and the audit log.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus className="mt-4 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base" />
        <div className="mt-4 flex gap-2"><Button type="submit" className="flex-1" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Save name"}</Button><Button type="button" variant="ghost" onClick={done}>Later</Button></div>
      </form>
    </div>
  );
}

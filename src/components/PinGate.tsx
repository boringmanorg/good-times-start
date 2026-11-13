import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { currentPinRequest, subscribePin } from "@/lib/pin-gate";
import { currentAdminCodeKey, setRolePolicy } from "@/lib/permissions";
import { ADMIN_CODE_STEP_MS, checkAdminCode, currentAdminCode, lastUsedStep, markStepUsed, type AdminCodeKey } from "@/lib/admin-code";
import { useRestaurantSettings } from "@/lib/use-settings";
import { useStaff, isAdmin } from "@/lib/staff";

const MAX_TRIES = 5;

/** Keeps the role policy and the admin-code secret in step with the restaurant settings. Renders nothing. */
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
export function PolicySync() {
  const settings = useRestaurantSettings();
  useIso(() => { setRolePolicy(settings.rolePolicy, settings.adminCode); }, [settings.rolePolicy, settings.adminCode]);
  return null;
}

/** "Admin code needed" prompt, shown when an action is set to On with admin code. Checked on this device, offline. */
export function PinGate() {
  const request = useSyncExternalStore(subscribePin, currentPinRequest, () => null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => { setCode(""); setError(""); setTries(0); }, [request]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!request || busy) return;
    setBusy(true);
    const step = await checkAdminCode(code, currentAdminCodeKey(), Date.now(), lastUsedStep());
    setBusy(false);
    if (step !== null) { markStepUsed(step); request.resolve(true); return; }
    const used = tries + 1;
    setTries(used);
    setCode("");
    if (used >= MAX_TRIES) { setError(""); request.resolve(false); return; }
    setError(`That code isn't right or was already used. Ask for the code showing now. ${MAX_TRIES - used} tr${MAX_TRIES - used === 1 ? "y" : "ies"} left.`);
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) request?.resolve(false); }}>
      <DialogContent className="max-w-xs">
        <form onSubmit={(e) => void submit(e)} className="text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" />
          <DialogTitle className="mt-2">Admin code needed</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{request?.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">Ask the admin for the 6-digit code on their phone. It changes every minute.</p>
          <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} aria-label="Admin code"
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }}
            className="mx-auto mt-4 block w-44 rounded-xl border border-input bg-card px-3 py-3 text-center font-mono text-2xl tracking-[0.35em]" />
          {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => request?.resolve(false)}>Cancel</Button>
            <Button type="submit" disabled={code.length < 6 || busy}>{busy ? "Checking…" : "Allow"}</Button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">If codes never work, check this device's date and time.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The live code with a countdown. Shown only to the owner or a manager. */
export function LiveAdminCode({ codeKey, size = "lg" }: { codeKey: AdminCodeKey; size?: "lg" | "sm" }) {
  const [state, setState] = useState<{ code: string; secondsLeft: number } | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () => { void currentAdminCode(codeKey.secret).then((s) => { if (live) setState(s); }); };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => { live = false; window.clearInterval(timer); };
  }, [codeKey.secret]);
  const left = state?.secondsLeft ?? 60;
  const pct = (left * 1000) / ADMIN_CODE_STEP_MS;
  return (
    <div className="flex items-center gap-4">
      <span className={size === "lg" ? "font-mono text-4xl font-bold tracking-[0.2em] tabular-nums" : "font-mono text-2xl font-bold tracking-[0.15em] tabular-nums"} aria-live="polite">
        {state ? `${state.code.slice(0, 3)} ${state.code.slice(3)}` : "··· ···"}
      </span>
      <span className="relative grid size-10 place-items-center" aria-label={`${left} seconds left`}>
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${pct * 97.4} 97.4`} className={left <= 10 ? "text-destructive" : "text-primary"} /></svg>
        <span className="text-xs font-semibold tabular-nums">{left}</span>
      </span>
    </div>
  );
}

/** Header key button: the owner or a manager opens the live code on any of their devices. */
export function AdminCodeButton() {
  const { user } = useStaff();
  const settings = useRestaurantSettings();
  const [open, setOpen] = useState(false);
  if (!isAdmin(user) || !settings.adminCode) return null;
  return (
    <>
      <Button size="icon" variant="ghost" aria-label="Show admin code" title="Admin code" onClick={() => setOpen(true)}><KeyRound /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs text-center">
          <KeyRound className="mx-auto size-7 text-primary" />
          <DialogTitle className="mt-1">Admin code</DialogTitle>
          <p className="text-sm text-muted-foreground">Tell staff this code when a terminal asks for it. It changes every 60 seconds and works once per terminal.</p>
          <div className="mt-3 flex justify-center">{open ? <LiveAdminCode codeKey={settings.adminCode} /> : null}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, KeyRound, LifeBuoy, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ago, loadStaff, type StaffLogin } from "@/lib/console-api";
import { createPlatformLogin, updatePlatformLogin } from "@/lib/platform-logins.functions";
import { platformSupportHistory, platformSupportSignIn } from "@/lib/platform-support.functions";
import { APPS } from "@/lib/staff-login-logic";
import { HANDOFF_KEY, supportAppFor, supportReasonProblem } from "@/lib/support-logic";
import { consoleToken } from "@/lib/console-client";
import { STAFF_ROLES, emailProblem, restaurantDomain, suggestEmail, type StaffRole } from "@/lib/platform-login-logic";
import { passwordProblem } from "@/lib/staff-login-logic";
import { cn } from "@/lib/utils";
import { field } from "./ConsoleBits";

/*
 * Super admin → a restaurant's logins. Logins are internal accounts on made-up email domains
 * (admin@xtsy.pos, billdesk2@tabbistro.pos…): create, rename, change role, reset password,
 * switch sign-in off/on or remove. Nothing here sends email.
 */

const roleName = (r: string) => STAFF_ROLES.find((x) => x.v === r)?.l ?? r;
const message = (e: unknown) => (e instanceof Error ? e.message : "Couldn't save. Check the internet.");

export function ConsoleLogins({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const queryClient = useQueryClient();
  const staff = useQuery({ queryKey: ["console", "staff", restaurantId], queryFn: () => loadStaff(restaurantId) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["console"] });
  const list = staff.data ?? [];
  const domain = restaurantDomain(list.map((s) => s.email));

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Logins <span className="font-normal text-muted-foreground">· internal sign-ins for {restaurantName}; addresses can be made up (no email is sent)</span></h3>
        {!adding ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><UserPlus />Add login</Button> : null}
      </div>
      {adding ? <AddLogin restaurantId={restaurantId} domain={domain} taken={list.map((s) => s.email)} onDone={() => { setAdding(false); void refresh(); }} onCancel={() => setAdding(false)} /> : null}
      {staff.error ? <p role="alert" className="mt-2 text-sm text-destructive">{message(staff.error)}</p> : null}
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
        {staff.isLoading ? <li className="p-3 text-sm text-muted-foreground">Loading logins…</li> : null}
        {list.map((s) => editing === s.userId
          ? <li key={s.userId} className="p-3"><EditLogin restaurantId={restaurantId} login={s} onDone={() => { setEditing(null); void refresh(); }} onCancel={() => setEditing(null)} /></li>
          : (
            <li key={s.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{s.email}</p>
                <p className="text-xs text-muted-foreground">{s.displayName} · {roleName(s.role)}{s.internal ? " · built-in login" : ""} · {s.devices} device{s.devices === 1 ? "" : "s"} · last sign-in {ago(s.lastSignIn)}</p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.signInOff ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>{s.signInOff ? "Sign-in off" : "Can sign in"}</span>
              <Button size="sm" variant="outline" disabled={s.signInOff} title={s.signInOff ? "Sign-in is off for this login" : `Open ${APPS[supportAppFor(s.email, s.role)].name} as this user`} onClick={() => setOpening(opening === s.userId ? null : s.userId)}><LifeBuoy />Sign in as</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(s.userId)}><Pencil />Edit</Button>
              {opening === s.userId ? <SignInAs restaurantId={restaurantId} login={s} onDone={() => { setOpening(null); void queryClient.invalidateQueries({ queryKey: ["console", "support", restaurantId] }); }} /> : null}
            </li>
          ))}
        {!staff.isLoading && !list.length && !staff.error ? <li className="p-3 text-sm text-muted-foreground">No logins yet.</li> : null}
      </ul>
      <SupportHistory restaurantId={restaurantId} />
    </div>
  );
}

/**
 * "Sign in as": opens this user's own app in a new tab (support-logic.ts). The reason is
 * required and kept in the restaurant's history; the tab shows a support banner throughout.
 */
function SignInAs({ restaurantId, login, onDone }: { restaurantId: string; login: StaffLogin; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = supportReasonProblem(reason);
  const app = APPS[supportAppFor(login.email, login.role)].name;
  const open = async () => {
    // Open the tab now, inside the click, so the browser doesn't block it as a pop-up.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const s = await platformSupportSignIn({ data: { token: await consoleToken(), restaurantId, userId: login.userId, reason } });
      window.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...s, at: Date.now() }));
      if (tab) tab.location.href = "/support"; else window.open("/support", "_blank");
      toast.success(`Opening ${app} as ${login.email}`);
      onDone();
    } catch (e) { tab?.close(); toast.error(message(e)); } finally { setBusy(false); }
  };
  return (
    <div className="w-full rounded-xl border border-primary/40 bg-primary-tint/40 p-3">
      <p className="text-sm font-semibold">Open {app} as {login.displayName || login.email}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Opens in a new tab with a support banner. That tab's browser storage switches to this restaurant, so if you also use this browser as a POS terminal, sync it first — or use a separate browser profile for support. Every sign-in is logged with your reason.</p>
      <label className="mt-2 block text-sm font-medium">Reason
        <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Owner asked to check a sync error on POS/0102" className={field} />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || Boolean(problem)} onClick={() => void open()}><ExternalLink />{busy ? "Opening…" : `Open ${app}`}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}><X />Cancel</Button>
        {problem && reason ? <span className="text-xs text-muted-foreground">{problem}</span> : null}
      </div>
    </div>
  );
}

function SupportHistory({ restaurantId }: { restaurantId: string }) {
  const history = useQuery({ queryKey: ["console", "support", restaurantId], queryFn: async () => platformSupportHistory({ data: { token: await consoleToken(), restaurantId } }) });
  const rows = history.data ?? [];
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">Support sign-ins <span className="font-normal text-muted-foreground">· who opened which login, and why</span></h3>
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
        {history.isLoading ? <li className="p-3 text-muted-foreground">Loading…</li> : null}
        {rows.map((h) => (
          <li key={h.at} className="flex flex-wrap gap-x-3 gap-y-0.5 p-3">
            <span className="font-mono">{h.email}</span>
            <span className="text-muted-foreground">{roleName(h.role)} · by {h.by || "super admin"} · {new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
            <span className="w-full text-xs text-muted-foreground">“{h.reason}”</span>
          </li>
        ))}
        {!history.isLoading && !rows.length ? <li className="p-3 text-muted-foreground">No support sign-ins yet.</li> : null}
      </ul>
    </div>
  );
}

function AddLogin({ restaurantId, domain, taken, onDone, onCancel }: { restaurantId: string; domain: string; taken: string[]; onDone: () => void; onCancel: () => void }) {
  const [role, setRole] = useState<StaffRole>("cashier");
  const [email, setEmail] = useState(() => suggestEmail("cashier", taken, domain));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = emailProblem(email) ?? (password ? passwordProblem(password) : "Set a first password.");
  const pickRole = (r: StaffRole) => { setRole(r); setEmail((cur) => (taken.includes(cur) || /^(admin|manager|billdesk|waiter|kitchen)\d*@/.test(cur) ? suggestEmail(r, taken, domain) : cur)); };
  const save = async () => {
    setBusy(true);
    try {
      const r = await createPlatformLogin({ data: { token: await consoleToken(), restaurantId, email, password, role, displayName: name } });
      toast.success(`Login ${r.email} created. Share the password with the person in person.`);
      onDone();
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 rounded-xl border border-primary/40 bg-primary-tint/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">Role
          <select value={role} onChange={(e) => pickRole(e.target.value as StaffRole)} className={field}>{STAFF_ROLES.map((r) => <option key={r.v} value={r.v}>{r.l} · {r.app}</option>)}</select>
        </label>
        <label className="text-sm font-medium">Login email
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} className={cn(field, "font-mono")} />
        </label>
        <label className="text-sm font-medium">Name <span className="font-normal text-muted-foreground">(optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} />
        </label>
        <label className="text-sm font-medium">First password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={field} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || Boolean(problem)} onClick={() => void save()}><Plus />{busy ? "Creating…" : "Create login"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X />Cancel</Button>
        {problem ? <span className="text-xs text-muted-foreground">{problem}</span> : null}
      </div>
    </div>
  );
}

function EditLogin({ restaurantId, login, onDone, onCancel }: { restaurantId: string; login: StaffLogin; onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState(login.email);
  const [name, setName] = useState(login.displayName);
  const [role, setRole] = useState(login.role);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = emailProblem(email) ?? (password ? passwordProblem(password) : null);
  const run = async (change: { email?: string; displayName?: string; role?: string; password?: string; signIn?: boolean; remove?: boolean }, done: string) => {
    setBusy(true);
    try {
      await updatePlatformLogin({ data: { token: await consoleToken(), restaurantId, userId: login.userId, ...change } as never });
      toast.success(done);
      onDone();
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  };
  const save = () => {
    const change: { email?: string; displayName?: string; role?: string; password?: string } = {};
    if (email.trim().toLowerCase() !== login.email) change.email = email;
    if (name.trim() !== login.displayName) change.displayName = name;
    if (role !== login.role) change.role = role;
    if (password) change.password = password;
    if (!Object.keys(change).length) { onCancel(); return; }
    void run(change, change.email ? `Login renamed to ${change.email.trim().toLowerCase()}. They sign in with the new address from now on.` : "Login saved");
  };
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">Login email
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} className={cn(field, "font-mono")} />
        </label>
        <label className="text-sm font-medium">Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} />
        </label>
        <label className="text-sm font-medium">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>{STAFF_ROLES.map((r) => <option key={r.v} value={r.v}>{r.l} · {r.app}</option>)}</select>
        </label>
        <label className="text-sm font-medium"><KeyRound className="mr-1 inline size-3.5" />New password <span className="font-normal text-muted-foreground">(blank = keep)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={field} />
        </label>
      </div>
      {login.internal && email.trim().toLowerCase() !== login.email ? (
        <p className="mt-2 text-xs text-warning">Built-in login: after renaming, staff type the full new address to sign in (the short name "{login.internal}" stops working).</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || Boolean(problem)} onClick={save}>{busy ? "Saving…" : "Save login"}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ signIn: login.signInOff }, login.signInOff ? "Sign-in switched on" : "Sign-in switched off: this login can't sign in on any device")}>
          {login.signInOff ? "Switch sign-in on" : "Switch sign-in off"}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}
          onClick={() => { if (window.confirm(`Remove ${login.email} from this restaurant? It can no longer sign in.`)) void run({ remove: true }, "Login removed"); }}><Trash2 />Remove</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X />Cancel</Button>
        {problem ? <span className="text-xs text-muted-foreground">{problem}</span> : null}
      </div>
    </div>
  );
}

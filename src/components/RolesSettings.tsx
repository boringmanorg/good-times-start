import { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConfirmButton } from "@/components/ConfirmButton";
import { LiveAdminCode } from "@/components/PinGate";
import { newAdminCodeKey } from "@/lib/admin-code";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/Segmented";
import { getSettings, saveSettings } from "@/lib/db";
import { useStaff } from "@/lib/staff";
import { can } from "@/lib/permissions";
import { useRestaurantSettings } from "@/lib/use-settings";
import {
  ALWAYS_ADMIN, POLICY_ACTIONS, POLICY_SCREENS, resolvePolicy,
  type Mode, type PolicyRole, type RolePolicy,
} from "@/lib/role-policy";
import { cn } from "@/lib/utils";

const ROLE_NAMES: Record<PolicyRole, string> = { cashier: "Reception (billdesk)", captain: "Waiter" };
const MODE_OPTIONS: { value: Mode; label: string }[] = [{ value: "off", label: "Off" }, { value: "on", label: "On" }, { value: "pin", label: "On with admin code" }];

export function RolesSettings() {
  const { user } = useStaff();
  const settings = useRestaurantSettings();
  const saved = useMemo(() => resolvePolicy(settings.rolePolicy), [settings.rolePolicy]);
  const [policy, setPolicy] = useState<RolePolicy>(saved);
  const [role, setRole] = useState<PolicyRole>("cashier");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPolicy(saved); }, [saved]);

  if (!can(user, "roles.manage")) return <p className="py-8 text-sm text-muted-foreground">Only the admin can change roles.</p>;

  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);
  const usesPin = (["cashier", "captain"] as PolicyRole[]).some((r) => Object.values(policy[r].actions).includes("pin"));
  const setAction = (id: keyof RolePolicy["cashier"]["actions"], mode: Mode) => setPolicy((p) => ({ ...p, [role]: { ...p[role], actions: { ...p[role].actions, [id]: mode } } }));
  const setScreen = (path: keyof RolePolicy["cashier"]["screens"], on: boolean) => setPolicy((p) => ({ ...p, cashier: { ...p.cashier, screens: { ...p.cashier.screens, [path]: on } } }));

  const save = async () => {
    setBusy(true);
    try {
      const current = await getSettings();
      await saveSettings({ ...current, rolePolicy: policy });
      toast.success("Roles saved. Every device follows them once it syncs.");
    } finally { setBusy(false); }
  };
  const setUpCode = async () => {
    setBusy(true);
    try {
      const current = await getSettings();
      const { adminPin: _retired, ...rest } = current;
      await saveSettings({ ...rest, adminCode: newAdminCodeKey() });
      toast.success(current.adminCode ? "New admin code key made. Older codes stop working on each terminal once it syncs." : "Admin code ready. Open it any time from the key button at the top.");
    } finally { setBusy(false); }
  };
  const removeCode = async () => {
    const current = await getSettings();
    const { adminCode: _drop, adminPin: _retired, ...rest } = current;
    await saveSettings(rest);
    toast.success("Admin code turned off. Actions set to On with admin code are blocked until it's set up again.");
  };

  const actions = POLICY_ACTIONS.filter((a) => a.roles.includes(role));
  const groups = [...new Set(actions.map((a) => a.group))];
  return (
    <div className="space-y-8 py-2">
      <section className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <div>
          <h2 className="text-base font-bold">Roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">What Reception and Waiter may do. <strong className="text-foreground">On with PIN</strong> asks for the admin PIN on the device each time. The admin can always do everything.</p>
        </div>
        <div className="space-y-5">
          <Segmented ariaLabel="Role" value={role} onChange={setRole} options={(Object.keys(ROLE_NAMES) as PolicyRole[]).map((r) => ({ value: r, label: ROLE_NAMES[r] }))} />

          {role === "cashier" ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <p className="border-b border-border bg-secondary/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Screens (Tables and bills are always on)</p>
              <ul className="divide-y divide-border">
                {POLICY_SCREENS.map((sc) => (
                  <li key={sc.path} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span><span className="block text-sm font-medium">{sc.label}</span><span className="block text-xs text-muted-foreground">{sc.hint}</span></span>
                    <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">Allow<Switch checked={policy.cashier.screens[sc.path]} onCheckedChange={(v) => setScreen(sc.path, v)} aria-label={`Allow ${sc.label}`} /></label>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">Waiters use Waiter Pro only: tables, menu and KOTs.</p>}

          {groups.map((group) => (
            <div key={group} className="overflow-hidden rounded-2xl border border-border bg-card">
              <p className="border-b border-border bg-secondary/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
              <ul className="divide-y divide-border">
                {actions.filter((a) => a.group === group).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0"><span className="block text-sm font-medium">{a.label}</span><span className="block text-xs text-muted-foreground">{a.hint}</span></span>
                    <Segmented ariaLabel={a.label} size="sm" value={policy[role].actions[a.id]} onChange={(m) => setAction(a.id, m)} options={MODE_OPTIONS} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="rounded-2xl border border-dashed border-border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" />Always owner or manager only</p>
            <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{ALWAYS_ADMIN.map((t) => <li key={t}>· {t}</li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">These are protected by the database too, so no device setting can open them.</p>
          </div>

          {usesPin && !settings.adminCode ? <p role="alert" className="rounded-xl bg-gold/15 p-3 text-sm font-medium text-warning">Some actions are On with admin code, but the admin code isn't set up yet. Set it up below, or those actions stay blocked.</p> : null}
          <div className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] -mx-4 flex items-center gap-3 lg:bottom-0 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
            <Button disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save roles"}</Button>
            {dirty ? <Button variant="ghost" onClick={() => setPolicy(saved)}>Undo changes</Button> : <span className="text-sm text-muted-foreground">All changes saved</span>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 border-t border-border pt-8 lg:grid-cols-[15rem_1fr]">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold"><KeyRound className="size-4" />Admin code</h2>
          <p className="mt-1 text-sm text-muted-foreground">A 6-digit code that changes every 60 seconds. Staff type it to allow an action set to On with admin code. It's made and checked on each device, with no internet needed, and each code works once per terminal.</p>
        </div>
        <div className="max-w-md space-y-3">
          {settings.adminCode ? <>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code now</p>
              <div className="mt-2"><LiveAdminCode codeKey={settings.adminCode} /></div>
              <p className="mt-3 text-xs text-muted-foreground">On any device where you're signed in as owner or manager, tap the key button at the top to see it. Set up {new Date(settings.adminCode.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ConfirmButton id="admin-code-new" disabled={busy} onConfirm={setUpCode} className={buttonVariants({ variant: "outline" })} armedClassName="!bg-gold !text-gold-foreground" confirm="Tap again: old codes stop">Make a new key</ConfirmButton>
              <ConfirmButton id="admin-code-off" onConfirm={removeCode} className={cn(buttonVariants({ variant: "ghost" }), "text-destructive hover:text-destructive")} armedClassName="!bg-destructive !text-destructive-foreground" confirm="Tap again to turn off">Turn off</ConfirmButton>
            </div>
            <p className="text-xs text-muted-foreground">Make a new key if you think someone has seen how codes are made, for example after a device is lost. Terminals pick it up when they sync.</p>
          </> : <>
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">Not set up yet.{settings.adminPin ? " The old fixed PIN no longer works." : ""}</p>
            <Button disabled={busy} onClick={() => void setUpCode()}><KeyRound />Set up admin code</Button>
          </>}
        </div>
      </section>
    </div>
  );
}

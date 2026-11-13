import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useStaff } from "@/lib/staff";
import { can } from "@/lib/permissions";
import { useRestaurantSettings } from "@/lib/use-settings";
import { APPS, DEVICE_LABELS } from "@/lib/staff-login-logic";
import { getDeviceId, loadTerminals, releaseTerminal, updateTerminal, type Terminal } from "@/lib/terminal-actions";
import { setMarketingTerminal } from "@/lib/marketing-access";
import { cn } from "@/lib/utils";

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function Row({ t, here, restaurantId, store, marketing, onChanged }: { t: Terminal; here: boolean; restaurantId: string; store: string; marketing: boolean; onChanged: () => void }) {
  const { user } = useStaff();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.description);
  useEffect(() => { setName(t.description); }, [t.description]);
  const run = async (work: () => Promise<void>, done: string) => {
    try { await work(); toast.success(done); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  };
  const label = t.description || (t.app ? APPS[t.app].short : "Terminal");
  return (
    <tr className={cn("align-middle", here && "bg-primary-tint/40")}>
      <td className="px-3 py-3 text-sm">{store}</td>
      <td className="px-3 py-3 font-mono text-sm font-semibold">{t.series || "—"}</td>
      <td className="px-3 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", t.status === "blocked" ? "bg-destructive/10 text-destructive" : t.status === "over_plan" ? "bg-gold/15 text-warning" : "bg-success/10 text-success")}
        title={t.status === "over_plan" ? "Your plan's seats for this app are full: release a device or ask XTSY to upgrade" : undefined}>{t.status === "blocked" ? "Blocked" : t.status === "over_plan" ? "Waiting for a seat" : "Active"}</span></td>
      <td className="px-3 py-3 text-sm">
        {editing ? (
          <span className="flex items-center gap-1">
            <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Counter PC" className="w-40 rounded-md border border-input bg-card px-2 py-1 text-sm" />
            <button type="button" aria-label="Save name" onClick={() => void run(() => updateTerminal(restaurantId, t.device_id, { description: name.trim() }), "Name saved").then(() => setEditing(false))} className="rounded p-1 text-success hover:bg-secondary"><Check className="size-4" /></button>
            <button type="button" aria-label="Cancel" onClick={() => { setEditing(false); setName(t.description); }} className="rounded p-1 text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>
          </span>
        ) : <>{label}{here ? <span className="ml-1.5 text-xs font-semibold text-primary">(this device)</span> : null}</>}
      </td>
      <td className="px-3 py-3 text-sm">{t.app ? APPS[t.app].short : "—"}</td>
      <td className="px-3 py-3">
        <button type="button" role="switch" aria-checked={marketing} aria-label={`Marketing on ${label}`} disabled={t.status === "blocked" && !marketing}
          onClick={() => void run(() => setMarketingTerminal(user, t.device_id, !marketing), marketing ? `Marketing switched off on ${label}` : `Marketing enabled on ${label}`)}
          className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40", marketing ? "bg-primary" : "bg-input")}>
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", marketing ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
        </button>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{t.device_kind ? DEVICE_LABELS[t.device_kind] : "—"}<br />{t.login_email || "—"}</td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{ago(t.last_seen)}<br />{t.last_ip || "—"}{t.last_location ? <><br />{t.last_location}</> : null}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil />Edit</Button>
          {t.status === "blocked"
            ? <Button size="sm" variant="outline" onClick={() => void run(() => updateTerminal(restaurantId, t.device_id, { status: "active" }), `${label} unblocked`)}>Unblock</Button>
            : <ConfirmButton id={`block-${t.device_id}`} disabled={here} onConfirm={() => run(() => updateTerminal(restaurantId, t.device_id, { status: "blocked" }), `${label} blocked`)}
                className={buttonVariants({ size: "sm", variant: "outline" })} armedClassName="!bg-gold !text-gold-foreground" confirm="Tap again to block">Block</ConfirmButton>}
          <ConfirmButton id={`release-${t.device_id}`} onConfirm={() => run(async () => { await releaseTerminal(restaurantId, t.device_id); if (marketing) await setMarketingTerminal(user, t.device_id, false); }, `${label} released`)}
            className={buttonVariants({ size: "sm", variant: "outline" })} armedClassName="!bg-gold !text-gold-foreground" confirm="Tap again to release">Release</ConfirmButton>
        </div>
      </td>
    </tr>
  );
}

export function TerminalsSettings() {
  const { user } = useStaff();
  const settings = useRestaurantSettings();
  const queryClient = useQueryClient();
  const restaurantId = user?.restaurantId ?? "";
  const [here, setHere] = useState("");
  useEffect(() => { void getDeviceId().then(setHere); }, []);
  const q = useQuery({ queryKey: ["terminals", restaurantId], queryFn: () => loadTerminals(restaurantId), enabled: !!restaurantId && can(user, "terminals.manage"), staleTime: 30_000, refetchInterval: 60_000 });
  if (!can(user, "terminals.manage")) return <p className="py-8 text-sm text-muted-foreground">Only the admin can manage terminals.</p>;
  const store = settings.name || user?.restaurantName || "Restaurant";
  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Terminals</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Every device that uses {store}: the counter computer, waiter phones and tablets, the admin's phone. <strong className="text-foreground">Key</strong> is its bill series. <strong className="text-foreground">Block</strong> stops staff using it at once; <strong className="text-foreground">Release</strong> forgets a replaced or lost device. <strong className="text-foreground">Marketing</strong> opens only on terminals you switch on here; every other terminal, including POS Billdesk counters, can't open it.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} />Refresh</Button>
      </div>
      {q.isError ? <p className="rounded-xl bg-secondary p-4 text-sm">{q.error instanceof Error ? q.error.message : "Couldn't load terminals."}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[62rem] text-left">
            <thead className="border-b border-border bg-secondary/60 text-xs font-semibold text-muted-foreground">
              <tr>{["Store", "Key", "Status", "Description", "Terminal type", "Marketing", "Device and login", "Last seen · IP · location", ""].map((h, i) => <th key={i} className={cn("px-3 py-2.5", i === 8 && "text-right")}>{h || "Action"}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading ? <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</td></tr>
                : !q.data?.length ? <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">No terminals yet. Devices appear here once they sign in.</td></tr>
                : q.data.map((t) => <Row key={t.device_id} t={t} here={t.device_id === here} restaurantId={restaurantId} store={store} marketing={!!settings.marketingDevices?.includes(t.device_id)} onChanged={() => void queryClient.invalidateQueries({ queryKey: ["terminals", restaurantId] })} />)}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Blocking works as soon as the device next checks in (within 5 minutes, or at once when it opens). A blocked device that's offline stays blocked once it has heard about it.</p>
    </div>
  );
}

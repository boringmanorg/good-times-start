import { useState } from "react";
import { Building2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStaff } from "@/lib/staff";
import { featureOn } from "@/lib/plans";
import { useEntitlements } from "@/lib/use-entitlements";
import { hasSeveralOutlets, rememberOutlet, switchTargets } from "@/lib/active-outlet";
import { prepareOutletSwitch } from "@/lib/outlet-actions";
import { cn } from "@/lib/utils";

/**
 * Move this device to another outlet of the same brand.
 *
 * A device holds one outlet's data at a time, so the switch clears the device and reloads.
 * It refuses while anything is still waiting to sync or a bill is running, because those
 * would be wiped — the refusal says which, so the person knows what to finish first.
 */
export function OutletSwitcher() {
  const { user } = useStaff();
  const plan = useEntitlements();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const memberships = user?.memberships ?? [];
  if (!user || !hasSeveralOutlets(memberships) || !featureOn(plan, "multi_outlet")) return null;

  const go = async (restaurantId: string) => {
    if (restaurantId === user.restaurantId) { setOpen(false); return; }
    setBusy(restaurantId);
    try {
      const stop = await prepareOutletSwitch(restaurantId);
      if (stop) { toast.error(stop); setBusy(null); return; }
      rememberOutlet(restaurantId);
      // A full reload rebinds the device: sync pulls the new outlet's menu, floor and bills.
      window.location.assign("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't switch outlet.");
      setBusy(null);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Switch outlet"
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
        <Building2 className="size-3.5 text-primary" />
        <span className="max-w-[9rem] truncate">{user.restaurantName || "Outlet"}</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Which outlet?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This device works in one outlet at a time. Switching clears it and loads the other outlet's
            menu, floor and bills. Anything not yet synced must go up first.
          </p>
          <div className="mt-3 space-y-2">
            {switchTargets(memberships, user.restaurantId).map((o) => {
              const here = o.restaurantId === user.restaurantId;
              return (
                <button key={o.restaurantId} type="button" disabled={!!busy} onClick={() => void go(o.restaurantId)}
                  className={cn("flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm",
                    here ? "border-primary bg-primary-tint" : "border-border hover:bg-secondary")}>
                  <Building2 className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{o.restaurantName}</span>
                  {busy === o.restaurantId ? <Loader2 className="size-4 animate-spin" />
                    : here ? <span className="flex items-center gap-1 text-xs font-semibold text-primary"><Check className="size-3.5" />You're here</span>
                    : <span className="text-xs text-muted-foreground">Switch</span>}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" className="mt-2" disabled={!!busy} onClick={() => setOpen(false)}>Stay here</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

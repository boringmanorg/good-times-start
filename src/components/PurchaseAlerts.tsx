import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { useStaff } from "@/lib/auth-context";
import { getDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/billing";
import { entryAmount, purchaseAlerts } from "@/lib/purchase-logic";
import { playBookingChime } from "@/lib/booking-alert-audio";

/**
 * Purchase approvals, both ways, with a chime: admins hear when the bill desk sends a purchase or
 * return for approval; whoever sent it, and every other admin, hears when it's approved or rejected. Runs at the
 * software root on every signed-in terminal (audio unlocks on the first tap, see BookingAlerts).
 */
export function PurchaseAlerts() {
  const { user } = useStaff();
  const admin = can(user, "stock.purchase");
  const involved = admin || can(user, "stock.request");
  const entries = useLiveQuery(() => (involved ? getDb().stockEntries.filter((e) => !!e.approval).toArray() : []), [involved], undefined);
  const seen = useRef<Record<string, string> | null>(null);
  const key = user ? `xtsy-purchase-alerts:${user.restaurantId ?? ""}:${user.login ?? user.displayName}` : null;
  useEffect(() => { seen.current = null; }, [key]);
  useEffect(() => {
    if (!user || !key || !involved || !entries) return;
    if (seen.current === null) {
      try { seen.current = JSON.parse(window.localStorage.getItem(key) ?? "null") as Record<string, string> | null; } catch { seen.current = null; }
      if (!seen.current) { // First look on this terminal: remember what's there without alerting.
        seen.current = Object.fromEntries(entries.map((e) => [e.id, e.approval?.status ?? ""]));
        try { window.localStorage.setItem(key, JSON.stringify(seen.current)); } catch { /* storage unavailable */ }
        return;
      }
    }
    const alerts = purchaseAlerts(entries, seen.current, { admin, name: user.displayName, login: user.login ?? undefined });
    if (alerts.length) {
      void playBookingChime();
      for (const a of alerts.slice(0, 3)) {
        const what = a.entry.purchaseId ? "Supplier return" : "Purchase";
        const amount = formatINR(Math.abs(entryAmount(a.entry)), 0);
        const who = a.entry.supplierName ? ` · ${a.entry.supplierName}` : "";
        if (a.kind === "requested") toast(`${what} ${amount}${who} waiting for your approval`, { description: `Sent by ${a.entry.approval?.requestedBy}. Check the supplier bill in Purchase.`, duration: 15000, action: { label: "Open", onClick: () => { window.location.href = "/stock"; } } });
        else if (a.kind === "approved") toast.success(`${what} ${amount}${who} approved by ${a.entry.approval?.decidedBy ?? "the admin"}`, { description: `Sent by ${a.entry.approval?.requestedBy}${a.entry.approval?.billChecked ? " · supplier bill checked" : ""}`, duration: 10000 });
        else toast.error(`${what} ${amount}${who} rejected by ${a.entry.approval?.decidedBy ?? "the admin"}`, { description: a.entry.approval?.note, duration: 15000 });
      }
    }
    seen.current = { ...seen.current, ...Object.fromEntries(entries.map((e) => [e.id, e.approval?.status ?? ""])) };
    try { window.localStorage.setItem(key, JSON.stringify(seen.current)); } catch { /* storage unavailable */ }
  }, [entries, user, key, involved, admin]);
  return null;
}

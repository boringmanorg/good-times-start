import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ReservationsPanel } from "@/components/ReservationsPanel";
import { useStaff, isAdmin } from "@/lib/staff";
import { getDb } from "@/lib/db";
import { useAppMode } from "@/lib/app-mode";
import { loadTerminals } from "@/lib/terminal-actions";
import { loadGuestOrders } from "@/lib/guest-order-actions";
import { useReservations } from "@/lib/use-reservations";
import { useEntitlements } from "@/lib/use-entitlements";
import { featureOn } from "@/lib/plans";
import { approvalStatus, entryAmount } from "@/lib/purchase-logic";
import { adminAlerts, type AdminAlert } from "@/lib/admin-alerts";
import { playBookingChime } from "@/lib/booking-alert-audio";
import { cn } from "@/lib/utils";

/*
 * The admin's bell (owner / manager, every app and device): new terminals to approve, purchases to
 * approve, QR orders and booking requests, devices waiting for a seat and the plan's renewal. A new item
 * chimes and, once the admin allows it, shows a phone / desktop notification while the app is open.
 */

const SEEN_KEY = "xtsy-admin-alerts-seen";

function notify(alert: AdminAlert) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(alert.title, { body: alert.detail, tag: alert.id, icon: "/favicon.png" });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* some browsers only notify from a service worker: the in-app chime still plays */ }
}

export function AdminAlerts() {
  const { user } = useStaff();
  const admin = isAdmin(user);
  const rid = user?.restaurantId ?? "";
  const app = useAppMode(user);
  const plan = useEntitlements();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const terminals = useQuery({ queryKey: ["terminals", rid], queryFn: () => loadTerminals(rid), enabled: admin && !!rid, refetchInterval: 30_000, staleTime: 20_000 });
  const qrOn = featureOn(plan, "qr_ordering") || featureOn(plan, "online_ordering");
  const guest = useQuery({ queryKey: ["guest-orders", rid], queryFn: () => loadGuestOrders(rid), enabled: admin && !!rid && qrOn, refetchInterval: 30_000 });
  const reservations = useReservations();
  const purchases = useLiveQuery(() => (admin ? getDb().stockEntries.filter((e) => approvalStatus(e) === "pending").toArray() : []), [admin], []);

  const alerts = useMemo(() => {
    if (!admin) return [];
    const list = terminals.data ?? [];
    const due = plan?.paidUntil && !plan.complimentary ? Date.parse(plan.paidUntil) : null;
    return adminAlerts({
      pendingTerminals: list.filter((t) => t.status === "pending"),
      waitingForSeat: list.filter((t) => t.status === "over_plan").length,
      pendingPurchases: (purchases ?? []).map((e) => ({ id: e.id, returns: !!e.purchaseId, amount: entryAmount(e) })),
      qrOrders: (guest.data ?? []).filter((o) => o.status === "new").length,
      bookingRequests: featureOn(plan, "bookings") ? reservations.rows.filter((r) => r.status === "pending" && Date.parse(r.end_at) > Date.now()).length : 0,
      plan: plan && !plan.complimentary ? { name: plan.planName, dueDate: due, lapsed: !plan.live, paused: plan.status === "suspended" } : null,
    });
  }, [admin, terminals.data, purchases, guest.data, reservations.rows, plan]);

  // A new item chimes (and notifies) once; the first look on a device only remembers what's there.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!admin) return;
    if (seen.current === null) {
      try { seen.current = new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { seen.current = new Set(); }
    }
    const fresh = alerts.filter((a) => a.urgent && !seen.current?.has(a.id));
    if (fresh.length) {
      void playBookingChime();
      for (const a of fresh.slice(0, 3)) notify(a);
    }
    seen.current = new Set([...alerts.map((a) => a.id)]);
    try { window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current].slice(-200))); } catch { /* storage unavailable */ }
  }, [admin, alerts]);

  if (!admin || !rid) return null;
  const urgent = alerts.filter((a) => a.urgent).length;
  const act = (a: AdminAlert) => {
    setOpen(false);
    if ("event" in a.action) {
      if (a.action.event === "pos:bookings" && app === "manager") { setBookings(true); return; }
      if (app === "manager") return; // QR orders are accepted at the counter (POS Billdesk)
      window.dispatchEvent(new Event(a.action.event));
      return;
    }
    if (a.action.to === "/stock") void navigate({ to: "/stock" });
    else void navigate({ to: "/settings", hash: a.action.hash });
  };
  const allow = async () => {
    try { const p = await Notification.requestPermission(); setPermission(p); } catch { /* unsupported */ }
  };

  return (
    <>
      <Button size="sm" variant={urgent ? "default" : "outline"} aria-label={`Alerts${alerts.length ? `: ${alerts.length}` : ""}`} title="Alerts for the admin" onClick={() => setOpen(true)}
        className={cn(urgent && "bg-gold text-gold-foreground hover:bg-gold/90")}>
        {urgent ? <BellRing className="size-4" /> : <Bell className="size-4" />}
        {alerts.length ? <span className="rounded-full bg-background/90 px-1.5 text-[11px] font-bold tabular-nums text-foreground">{alerts.length}</span> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogTitle>Alerts</DialogTitle>
          {permission === "default" ? (
            <div className="rounded-xl bg-primary-tint/50 p-3 text-sm">
              <p>Get a phone or desktop notification for new terminals, purchases and orders while POS Manager is open.</p>
              <Button size="sm" className="mt-2" onClick={() => void allow()}>Turn on notifications</Button>
            </div>
          ) : null}
          {!alerts.length ? <p className="py-6 text-center text-sm text-muted-foreground">All clear. Nothing is waiting for you.</p> : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className={cn("rounded-xl border p-3", a.urgent ? "border-gold/50 bg-gold/10" : "border-border bg-card")}>
                  <p className={cn("text-sm font-semibold", a.urgent && "text-warning")}>{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
                  {"event" in a.action && a.action.event === "pos:qr-requests" && app === "manager"
                    ? <p className="mt-2 text-xs font-medium text-muted-foreground">Accept them on POS Billdesk.</p>
                    : <Button size="sm" variant="outline" className="mt-2" onClick={() => act(a)}>{a.label}</Button>}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={bookings} onOpenChange={setBookings}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogTitle>Table bookings</DialogTitle>
          <ReservationsPanel upcoming onOpenOrder={() => setBookings(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

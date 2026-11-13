/**
 * Everything waiting on the admin, in one list for the POS Manager bell. Pure, tested.
 * Each item has a stable id, so a new one can chime and raise a phone / desktop notification once.
 */

export type AlertAction = { to: "/settings"; hash: "terminals" | "plan" } | { to: "/stock" } | { event: "pos:qr-requests" | "pos:bookings" };

export interface AdminAlert {
  id: string;
  title: string;
  detail: string;
  /** Needs doing now (shown first, in amber). */
  urgent: boolean;
  action: AlertAction;
  label: string;
}

export interface AlertInput {
  pendingTerminals: { device_id: string; app: string; login_email: string }[];
  waitingForSeat: number;
  pendingPurchases: { id: string; returns: boolean; amount: number }[];
  qrOrders: number;
  bookingRequests: number;
  plan: { name: string; dueDate: number | null; lapsed: boolean; paused: boolean } | null;
  now?: number;
}

const APP_NAME: Record<string, string> = { pos: "POS Billdesk", manager: "POS Manager", waiter: "Waiter Pro" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function adminAlerts(i: AlertInput): AdminAlert[] {
  const now = i.now ?? Date.now();
  const out: AdminAlert[] = [];
  for (const t of i.pendingTerminals) {
    out.push({ id: `terminal:${t.device_id}`, urgent: true, title: `New ${APP_NAME[t.app] ?? "terminal"} wants to join`,
      detail: `${t.login_email || "A login"} signed in on a new device. Approve and name it, or turn it away.`, action: { to: "/settings", hash: "terminals" }, label: "Review" });
  }
  if (i.pendingPurchases.length) {
    const returns = i.pendingPurchases.filter((p) => p.returns).length;
    const total = i.pendingPurchases.reduce((s, p) => s + Math.abs(p.amount), 0);
    out.push({ id: `purchases:${i.pendingPurchases.map((p) => p.id).sort().join(",")}`, urgent: true,
      title: `${plural(i.pendingPurchases.length, "purchase")} to approve`,
      detail: `${returns ? `${plural(returns, "supplier return")} included · ` : ""}₹${Math.round(total).toLocaleString("en-IN")} in all. Check the supplier bills.`, action: { to: "/stock" }, label: "Open Purchase" });
  }
  if (i.qrOrders > 0) out.push({ id: `qr:${i.qrOrders}`, urgent: true, title: `${plural(i.qrOrders, "QR order")} waiting`, detail: "Guests are waiting for the counter to accept.", action: { event: "pos:qr-requests" }, label: "Open" });
  if (i.bookingRequests > 0) out.push({ id: `bookings:${i.bookingRequests}`, urgent: true, title: `${plural(i.bookingRequests, "table booking request")}`, detail: "Allot a table and confirm, or decline.", action: { event: "pos:bookings" }, label: "Open" });
  if (i.waitingForSeat > 0) out.push({ id: `seats:${i.waitingForSeat}`, urgent: false, title: `${plural(i.waitingForSeat, "device")} waiting for a free place`, detail: "The plan's places for that app are full. Release an old device, or ask XTSY to upgrade.", action: { to: "/settings", hash: "terminals" }, label: "Terminals" });
  if (i.plan) {
    const days = i.plan.dueDate === null ? null : Math.ceil((i.plan.dueDate - now) / 86_400_000);
    if (i.plan.paused) out.push({ id: "plan:paused", urgent: true, title: `${i.plan.name} plan is paused`, detail: "Billing keeps working. Contact XTSY to resume the extras.", action: { to: "/settings", hash: "plan" }, label: "Plan" });
    else if (i.plan.lapsed) out.push({ id: "plan:lapsed", urgent: true, title: `${i.plan.name} renewal overdue`, detail: "Billing keeps working; plan extras are switched off until renewal.", action: { to: "/settings", hash: "plan" }, label: "Plan" });
    else if (days !== null && days <= 5) out.push({ id: `plan:due:${days}`, urgent: days <= 0, title: days <= 0 ? `${i.plan.name} renewal due today` : `${i.plan.name} renews in ${plural(days, "day")}`, detail: "Pay XTSY to keep every feature on.", action: { to: "/settings", hash: "plan" }, label: "Plan" });
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

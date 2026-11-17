/**
 * Extra Summary insights for Pro Lite and above: how the chosen period compares with the one
 * before it, when the restaurant is busiest, which dishes are rising or falling, returning
 * guests, and purchases against sales. Pure, so every number can be checked by hand.
 */
import { itemSales, salesSummary, summaryAt, type Range } from "./report-logic";
import { approvalStatus } from "./purchase-logic";
import type { MenuItem, Order, StockEntry } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const change = (now: number, before: number): number | null => (before > 0 ? r2(now / before - 1) : null);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The period of the same length that ends just before this one. */
export function previousRange(range: Range): Range {
  const length = range.to - range.from + 1;
  return { from: range.from - length, to: range.from - 1 };
}

/** Approved purchases less approved returns whose date falls in the range. Transfers are not purchases. */
export function purchaseSpend(entries: StockEntry[], range: Range): number {
  let spend = 0;
  for (const e of entries) {
    if (e.at < range.from || e.at > range.to || approvalStatus(e) !== "approved") continue;
    if (e.type !== "purchase" && !(e.type === "return" && e.purchaseId)) continue;
    for (const i of e.items) spend += i.qty * (i.unitCost ?? 0);
  }
  return r2(spend);
}

export interface Mover { name: string; qty: number; before: number; delta: number }

export interface SummaryInsights {
  net: number; netBefore: number; netChange: number | null;
  bills: number; billsBefore: number; billsChange: number | null;
  average: number; averageBefore: number; averageChange: number | null;
  peakHour: { hour: number; net: number } | null;
  bestWeekday: { name: string; net: number } | null;
  topItems: { name: string; qty: number; amount: number; share: number }[];
  rising: Mover[];
  falling: Mover[];
  guests: { identified: number; returning: number; returningShare: number | null };
  purchases: { spend: number; shareOfSales: number | null } | null;
}

const phoneOf = (o: Order) => (o.customer?.phone ?? "").replace(/\D/g, "").slice(-10);

export function summaryInsights(
  orders: Order[], before: Order[], menu: MenuItem[], range: Range,
  opts: { entries?: StockEntry[]; history?: Order[] } = {},
): SummaryInsights {
  const now = salesSummary(orders);
  const prev = salesSummary(before);
  const settled = orders.filter((o) => o.status === "settled");

  const hours = new Map<number, number>();
  const weekdays = new Map<number, number>();
  for (const o of settled) {
    const d = new Date(summaryAt(o));
    hours.set(d.getHours(), (hours.get(d.getHours()) ?? 0) + o.total);
    weekdays.set(d.getDay(), (weekdays.get(d.getDay()) ?? 0) + o.total);
  }
  const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const peak = top(hours);
  const bestDay = range.to - range.from >= 6 * 86_400_000 ? top(weekdays) : undefined;

  const items = itemSales(orders, menu);
  const itemsBefore = new Map(itemSales(before, menu).map((i) => [i.name, i.qty]));
  const totalAmount = items.reduce((t, i) => t + i.amount, 0);
  const moves: Mover[] = [...new Set([...items.map((i) => i.name), ...itemsBefore.keys()])].map((name) => {
    const qty = items.find((i) => i.name === name)?.qty ?? 0;
    const was = itemsBefore.get(name) ?? 0;
    return { name, qty, before: was, delta: qty - was };
  });

  // Returning guest: a phone on a bill in this period that also appears on an earlier bill.
  const phones = new Set(settled.map(phoneOf).filter((p) => p.length === 10));
  const earlier = new Set((opts.history ?? before).filter((o) => o.status === "settled" && summaryAt(o) < range.from).map(phoneOf));
  const returning = [...phones].filter((p) => earlier.has(p)).length;

  const spend = opts.entries ? purchaseSpend(opts.entries, range) : null;
  return {
    net: now.net, netBefore: prev.net, netChange: change(now.net, prev.net),
    bills: now.bills, billsBefore: prev.bills, billsChange: change(now.bills, prev.bills),
    average: now.average, averageBefore: prev.average, averageChange: change(now.average, prev.average),
    peakHour: peak ? { hour: peak[0], net: r2(peak[1]) } : null,
    bestWeekday: bestDay ? { name: WEEKDAYS[bestDay[0]]!, net: r2(bestDay[1]) } : null,
    topItems: items.slice(0, 5).map((i) => ({ name: i.name, qty: i.qty, amount: i.amount, share: totalAmount ? r2(i.amount / totalAmount) : 0 })),
    rising: moves.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
    falling: moves.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3),
    guests: { identified: phones.size, returning, returningShare: phones.size ? r2(returning / phones.size) : null },
    purchases: spend === null ? null : { spend, shareOfSales: now.net > 0 ? r2(spend / now.net) : null },
  };
}

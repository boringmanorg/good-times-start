/**
 * Enterprise / Brand: several outlets under one account.
 *
 * The cloud already carries this (create_outlet, push_menu, outlet_sales in outlet-actions.ts);
 * these are the rules the Brand screen reads from, kept pure so they can be tested.
 */
import type { OutletDay } from "./outlet-actions";

export interface Outlet { id: string; name: string; city: string; slug: string | null }

/** Totals for one outlet over the chosen days. */
export interface OutletTotals { id: string; bills: number; net: number; tax: number; average: number }

/** Roll the per-day rows up per outlet, so an outlet with no sales still reads as zero. */
export function totalsByOutlet(outlets: Outlet[], days: OutletDay[]): OutletTotals[] {
  return outlets.map((o) => {
    const mine = days.filter((d) => d.restaurant_id === o.id);
    const bills = mine.reduce((n, d) => n + d.bills, 0);
    const net = mine.reduce((n, d) => n + d.net, 0);
    return { id: o.id, bills, net, tax: mine.reduce((n, d) => n + d.tax, 0), average: bills ? net / bills : 0 };
  });
}

/** The brand's own line: every outlet added together. */
export function brandTotals(rows: OutletTotals[]): Omit<OutletTotals, "id"> {
  const bills = rows.reduce((n, r) => n + r.bills, 0);
  const net = rows.reduce((n, r) => n + r.net, 0);
  return { bills, net, tax: rows.reduce((n, r) => n + r.tax, 0), average: bills ? net / bills : 0 };
}

/** Busiest outlet first, so the brand owner reads the ranking top down. Ties keep outlet order. */
export function ranked(rows: OutletTotals[]): OutletTotals[] {
  return [...rows].sort((a, b) => b.net - a.net);
}

/** Each outlet's share of brand sales, 0-1. Zero sales across the brand gives every outlet 0. */
export function shareOfBrand(row: OutletTotals, total: number): number {
  return total > 0 ? row.net / total : 0;
}

/** Why a new outlet can't be added, or null. */
export function newOutletProblem(name: string, used: number, allowed: number | null): string | null {
  if (name.trim().length < 2) return "Give the outlet a name.";
  if (name.trim().length > 60) return "Keep the name under 60 characters.";
  if (allowed !== null && used >= allowed) {
    return `This plan covers ${allowed} outlet${allowed === 1 ? "" : "s"}. Ask XTSY to raise it.`;
  }
  return null;
}

/**
 * Why the menu can't be pushed, or null. Pushing replaces the menu at the chosen outlets, so
 * it is never allowed to run with nothing selected — that reads as "push to all" and isn't.
 */
export function pushMenuProblem(fromId: string | null, toIds: string[]): string | null {
  if (!fromId) return "Choose the outlet to copy the menu from.";
  const targets = toIds.filter((id) => id !== fromId);
  if (!targets.length) return "Choose at least one outlet to copy the menu to.";
  return null;
}

/** "Chennai · 3 outlets" style summary for the brand header. */
export function outletCountText(n: number): string {
  return n === 1 ? "1 outlet" : `${n} outlets`;
}

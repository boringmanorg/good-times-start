import type { ReactNode } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { getPrintConfig } from "@/lib/print-config";
import { kotPrintGroups, kotsForDevice, slipLayoutOf, withCopies, shouldPrintKot } from "@/lib/print-logic";
import { getSettings } from "@/lib/db";
import type { Kot, Order } from "@/lib/types";
import { upiLink } from "@/lib/billing";
import { billSlip, escPos, kotSlip, rawbtIntent } from "@/lib/slip";
import { SlipView } from "@/components/Slip";
import { getChosenApp } from "@/lib/app-mode";
import { supabase } from "@/integrations/supabase/client";
import { queueCounterPrint } from "@/lib/counter-print";
import { thermalDestination } from "@/lib/print-routing";
import { numberBillForPrint } from "@/lib/bill-numbering";

/**
 * One place every screen prints through. Bills and KOTs are thermal slips
 * (see slip.ts). With "browser" printing they render into the hidden #print-root
 * drawn by <PrintHost>, one per page at this device's paper width; with "rawbt"
 * they go straight to the RawBT app. Printing never blocks billing: if it fails,
 * nothing else changes.
 */

let jobs: ReactNode[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => jobs;
const NOTHING: ReactNode[] = [];
// Must return the same value every time, or React re-renders forever.
const serverSnapshot = (): ReactNode[] => NOTHING;

/** KOTs this device printed already, so a ticket that later syncs back isn't printed twice. */
const printedKots = new Set<string>();

export function printDocuments(docs: ReactNode[]): void {
  if (!docs.length || typeof window === "undefined") return;
  jobs = docs;
  emit();
}

/** Send ready-made printer commands to RawBT (Android): it prints at once, with no preview or printer choice. */
function sendToRawbt(chunks: Uint8Array[]): void {
  const size = chunks.reduce((t, c) => t + c.length, 0);
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  try { window.location.href = rawbtIntent(all); } catch { /* RawBT missing: the bill is already saved */ }
}

/** Print bill copies per this device's settings, in the thermal slip layout. */
export async function printBill(unnumbered: Order): Promise<void> {
  // A running bill gets its official POS number the first time it is printed.
  const order = await numberBillForPrint(unnumbered);
  if (await routeWirelessPrint('bill', order)) return;
  const [config, settings] = await Promise.all([getPrintConfig(), getSettings()]);
  const slip = billSlip(order, settings, slipLayoutOf(config));
  const copies = Math.max(1, config.billCopies);
  const due = order.status === "held" ? order.total : order.payments.filter((p) => p.mode === "credit").reduce((s, p) => s + p.amount, 0);
  const link = slip.qr && settings.upiVpa ? upiLink({ vpa: settings.upiVpa, name: settings.name || "Restaurant", amount: due, billNo: order.billNo }) : undefined;
  if (config.method === "rawbt") { sendToRawbt([escPos(slip, { copies, cutter: config.cutter, ...(link ? { upiLink: link } : {}) })]); return; }
  const qr = link ? await QRCode.toDataURL(link, { width: 240, margin: 0 }).catch(() => undefined) : undefined;
  printDocuments(Array.from({ length: copies }, (_, i) => <SlipView key={`${order.billNo}-${i}`} slip={slip} qrDataUrl={qr} />));
}

/**
 * Print KOTs per this device's settings: only its stations, one ticket per
 * station or combined, the configured number of copies.
 * `source` "sent" = this device just sent them; "incoming" = they arrived from another device.
 */
export async function printKots(kots: Kot[], source: "sent" | "incoming" | "reprint"): Promise<void> {
  if (source === 'incoming') return;
  if (await routeWirelessPrint('kot', kots)) return;
  const config = await getPrintConfig();
  if (!shouldPrintKot(source, config)) return;
  let mine = source === "reprint" ? kots : kotsForDevice(kots, config);
  if (source !== "reprint") mine = mine.filter((k) => !k.uid || !printedKots.has(k.uid));
  for (const k of mine) if (k.uid) printedKots.add(k.uid);
  if (!mine.length) return;
  const settings = await getSettings();
  const groups = withCopies(kotPrintGroups(mine, settings.kotByStation ?? true), Math.max(1, config.kotCopies));
  const slips = groups.map((g) => kotSlip(g, slipLayoutOf(config), settings.kotHeader ?? "", config.largeKotText));
  if (config.method === "rawbt") { sendToRawbt(slips.map((slip) => escPos(slip, { cutter: config.cutter }))); return; }
  printDocuments(slips.map((slip, i) => <div key={`${groups[i]?.[0]?.uid ?? i}-${i}`} className="kot-print-slip"><SlipView slip={slip} /></div>));
}

/** Mark KOTs as already handled on this device (e.g. ones present when a screen opens). */
export function markKotsSeen(kots: Kot[]): void {
  for (const k of kots) if (k.uid) printedKots.add(k.uid);
}

/** The print jobs waiting for <PrintHost> to draw them. */
export const subscribePrintJobs = subscribe;
export const printJobsSnapshot = snapshot;
export const printJobsServerSnapshot = serverSnapshot;
export function clearPrintJobs(): void { jobs = []; emit(); }
export function hasPrintJobs(): boolean { return jobs.length > 0; }

async function routeWirelessPrint(kind: 'bill' | 'kot', payload: Order | Kot[]): Promise<boolean> {
  const destination = thermalDestination(getChosenApp() ?? 'pos');
  if (destination === 'blocked') return true;
  if (destination === 'local') return false;
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) { toast.error('Sign in to send printing to the counter'); return true; }
  // Cached membership enables the durable local queue during outages.
  const cached = window.localStorage.getItem('xtsy-pos-staff');
  const staff = cached ? JSON.parse(cached) as { id: string; restaurantId: string | null } : null;
  if (!staff?.restaurantId || staff.id !== id) { toast.error('Restaurant access is unavailable'); return true; }
  await queueCounterPrint(staff.restaurantId, kind, payload);
  toast.success('Print request saved for the counter');
  return true;
}

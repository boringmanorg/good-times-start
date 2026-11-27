/**
 * Stay invoices: the strict STAY series number from the cloud, and the printable A4 invoice /
 * payment receipt. The number needs the internet; the HTML is pure (tested).
 */
import { supabase } from "@/lib/supabase-app";
import { getDb } from "../db";
import { formatINR } from "../billing";
import { shortDay } from "./dates";
import { folioOf } from "./folio";
import type { Stay, UnitType } from "./types";

/** A stable UUID from the stay id, so a retried check-out asks for (and gets) the same number. */
export async function stayRequestId(stayId: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`stay-invoice:${stayId}`)),
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5 style
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function stayInvoiceNumber(stayId: string): Promise<string> {
  const restaurantId = (await getDb().meta.get("restaurantId"))?.value;
  if (typeof restaurantId !== "string" || !restaurantId)
    throw new Error(
      "This device hasn't finished connecting to the property. Wait for Live sync and try again.",
    );
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new Error(
      "Check-out needs the internet for the GST invoice number. Connect and try again.",
    );
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("allocate_restaurant_number", {
    _restaurant_id: restaurantId,
    _series: "STAY",
    _request_id: await stayRequestId(stayId),
  });
  if (error)
    throw new Error(
      `Couldn't take the invoice number: ${/fetch|network|load failed/i.test(error.message) ? "no connection to the cloud right now" : error.message}`,
    );
  if (typeof data !== "string" || !/^STAY\/\d{4,}$/.test(data))
    throw new Error("The cloud returned an invalid invoice number. Nothing was saved.");
  return data;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface InvoiceProperty {
  name: string;
  legalName?: string | undefined;
  address?: string | undefined;
  gstin?: string | undefined;
  phone?: string | undefined;
  billFooter?: string | undefined;
}

/** The A4 tax invoice (or, before check-out, a pro-forma folio) as a print-ready HTML page. */
export function invoiceHtml(stay: Stay, types: UnitType[], p: InvoiceProperty): string {
  const f = folioOf(stay, types);
  const title = stay.invoice ? `Tax invoice ${stay.invoice.no}` : "Folio (not a tax invoice)";
  const date = new Date(stay.invoice?.at ?? Date.now()).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const rows = f.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.label)}</td><td class="n">${formatINR(l.taxable, 2)}</td><td class="n">${l.gstPct}%</td><td class="n">${formatINR(l.gst, 2)}</td><td class="n">${formatINR(l.taxable + l.gst, 2)}</td></tr>`,
    )
    .join("");
  const pays = stay.payments
    .map(
      (x) =>
        `<tr><td>${new Date(x.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${x.kind === "refund" ? "Refund" : x.kind === "advance" ? "Advance" : "Payment"} · ${esc(x.mode.toUpperCase().replace("_", " "))}${x.reference ? ` · ${esc(x.reference)}` : ""}</td><td class="n">${x.kind === "refund" ? "+" : "−"}${formatINR(x.amount, 2)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:13px/1.45 system-ui,sans-serif;color:#1f2230;margin:32px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}
td,th{padding:6px 8px;border-bottom:1px solid #e5e0d6;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}th{font-size:11px;text-transform:uppercase;color:#6b6457}
.top{display:flex;justify-content:space-between;gap:24px}.muted{color:#6b6457}.tot td{font-weight:700;border-bottom:0}@media print{body{margin:12mm}}</style></head><body>
<div class="top"><div><h1>${esc(p.legalName || p.name)}</h1><div class="muted">${esc(p.address ?? "")}${p.gstin ? `<br>GSTIN ${esc(p.gstin)}` : ""}${p.phone ? `<br>${esc(p.phone)}` : ""}</div></div>
<div style="text-align:right"><h1>${esc(title)}</h1><div class="muted">${date}<br>Booking ${esc(stay.reference)}${p.gstin ? "<br>SAC 996311 · Accommodation services" : ""}</div></div></div>
<p><b>${esc(stay.guest.name)}</b> · ${esc(stay.guest.phone)}<br>${shortDay(stay.checkIn)} → ${shortDay(stay.checkOut)} · ${f.nights} night${f.nights === 1 ? "" : "s"}${stay.ota ? ` · ${esc(stay.ota.name)} ${esc(stay.ota.bookingId)}` : ""}</p>
<table><thead><tr><th>Item</th><th class="n">Taxable</th><th class="n">GST</th><th class="n">GST ₹</th><th class="n">Amount</th></tr></thead><tbody>${rows}
<tr class="tot"><td>Total</td><td class="n">${formatINR(f.taxable, 2)}</td><td></td><td class="n">${formatINR(f.gst, 2)}</td><td class="n">${formatINR(f.total, 0)}</td></tr></tbody></table>
${pays ? `<table><thead><tr><th>Payments</th><th class="n">₹</th></tr></thead><tbody>${pays}<tr class="tot"><td>${f.due > 0 ? "Due" : f.due < 0 ? "To refund" : "Settled"}</td><td class="n">${formatINR(Math.abs(f.due), 0)}</td></tr></tbody></table>` : ""}
<p class="muted" style="margin-top:24px">Stay GST: nil up to ₹1,000 a night, 5% up to ₹7,500, 18% above, per room or bed per night.</p>
${p.billFooter ? `<p style="margin-top:8px">${esc(p.billFooter)}</p>` : ""}
<script>window.onload=()=>window.print()</script></body></html>`;
}

/** Open the invoice in a new window and print it. */
export function printInvoice(stay: Stay, types: UnitType[], p: InvoiceProperty): void {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) throw new Error("Allow pop-ups to print the invoice.");
  win.document.open();
  win.document.write(invoiceHtml(stay, types, p));
  win.document.close();
}

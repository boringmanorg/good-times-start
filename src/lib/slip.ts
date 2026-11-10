/**
 * Bills and KOTs as thermal-printer slips: fixed-width lines laid out for the paper
 * (32 characters on 58 mm, 48 on 80 mm), the way restaurant slips have always looked.
 * The same lines become ESC/POS bytes for direct printing (RawBT on Android) or a
 * monospace page for silent Chrome printing on a computer, so both print identically.
 * Pure functions: no DOM, no database.
 */
import { gstModeOf, exemptionNote } from "./billing-config";
import type { Kot, Order, RestaurantSettings } from "./types";

export type Paper = 58 | 80;
export const columnsFor = (paper: Paper) => (paper === 58 ? 30 : 45);

/**
 * How a printer lays out a slip: paper width, how many characters fit on a line (some printers print
 * less than the full roll; the Print width test finds it) and a side margin in mm. Lines wrap inside it.
 */
export interface SlipLayout { paper: Paper; cols?: number | null | undefined; marginMm?: number | undefined }
export type PaperOrLayout = Paper | SlipLayout;
export const MIN_SLIP_COLS = 16;
/** The widest line each paper can hold in this font, before margins. */
export const maxColumnsFor = (paper: Paper) => (paper === 58 ? 32 : 48);
const CHAR_MM = 1.46; // one character of the slip font, in mm
export function layoutOf(p: PaperOrLayout): { paper: Paper; cols: number; marginMm: number } {
  const lay = typeof p === "number" ? { paper: p } : p;
  const paper: Paper = lay.paper === 80 ? 80 : 58;
  const marginMm = Math.min(8, Math.max(0, Number.isFinite(lay.marginMm) ? Number(lay.marginMm) : 0));
  // Columns that fit between the two side margins.
  const room = Math.floor(((paper === 58 ? 48 : 72) - 2 * marginMm) / CHAR_MM);
  const wanted = lay.cols && Number.isInteger(lay.cols) ? lay.cols : columnsFor(paper);
  return { paper, marginMm, cols: Math.max(MIN_SLIP_COLS, Math.min(wanted, columnsFor(paper), room)) };
}

export interface SlipLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  /** "tall" doubles the height (same width: readable without losing columns); "big" doubles both. */
  size?: "normal" | "tall" | "big";
}
/** Blank paper before a KOT (3 cm), after a KOT (1 cm) and after the main bill (3 cm). */
export const KOT_START_FEED_MM = 30;
export const KOT_END_FEED_MM = 10;
export const BILL_END_FEED_MM = 30;
export interface Slip { paper: Paper; lines: SlipLine[]; qr?: string | undefined; endFeedMm?: number; startFeedMm?: number; /** Side margin in mm. */ marginMm?: number }

const ORDER_TYPE: Record<string, string> = { "dine-in": "DINE IN", takeaway: "TAKEAWAY", delivery: "DELIVERY", swiggy: "SWIGGY", zomato: "ZOMATO" };
const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", wallet: "Wallet", credit: "Due", points: "Points" };

/** Thermal printers print ASCII; swap the few characters menus and names use. */
export function plain(text: string): string {
  return text
    .replace(/₹/g, "Rs.").replace(/[×✕]/g, "x").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "");
}

/** Wrap text to a width, breaking on spaces where possible. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/).map(plain)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else { out.push(line); line = word; }
      while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width); }
    }
    out.push(line);
  }
  return out;
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));
const pad = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length));
const lpad = (s: string, w: number) => (s.length >= w ? s.slice(-w) : " ".repeat(w - s.length) + s);
const rule = (cols: number): SlipLine => ({ text: "-".repeat(cols) });
/** Label on the left, value on the right, on one line. */
const pair = (label: string, value: string, cols: number, extra: Partial<SlipLine> = {}): SlipLine =>
  ({ text: `${pad(plain(label), Math.max(0, cols - value.length - 1))} ${value}`.slice(-cols), ...extra });

function dateTime(at: number): { date: string; time: string } {
  const d = new Date(at);
  const dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return { date: `${dd}-${mm}-${d.getFullYear()}`, time: `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}` };
}

/** Last safety net: any line still wider than the printer wraps onto the next line instead of being cut. */
function fitLines(lines: SlipLine[], cols: number): SlipLine[] {
  return lines.flatMap((l) => {
    const width = l.size === "big" ? Math.floor(cols / 2) : cols;
    if (l.text.length <= width) return [l];
    const indent = /^\s*/.exec(l.text)?.[0] ?? "";
    return wrap(l.text, width).map((text, i) => ({ ...l, text: i && indent && text.length + indent.length <= width ? indent + text : text }));
  });
}

/** Item table columns: name wraps in its own column, numbers stay lined up on the right. */
function itemColumns(cols: number) {
  return cols >= 48 ? { qty: 5, rate: 9, amt: 10 } : { qty: 4, rate: 0, amt: 9 };
}

/** The customer bill: header, guest and table, items, totals, payment, UPI QR and footer. */
export function billSlip(order: Order, settings: RestaurantSettings, layout: PaperOrLayout, endFeedMm = BILL_END_FEED_MM): Slip {
  const { paper, cols, marginMm } = layoutOf(layout);
  const L: SlipLine[] = [];
  const center = (text: string, extra: Partial<SlipLine> = {}) => { for (const t of wrap(text, extra.size === "big" ? cols / 2 : cols)) L.push({ text: t, align: "center", ...extra }); };
  const exempt = Boolean(order.tax?.exempt);
  const composition = gstModeOf(settings) === "composition";

  const name = settings.name || "Restaurant";
  center(name, { bold: true, size: plain(name).length <= cols / 2 ? "big" : "tall" });
  if (settings.legalName && settings.legalName !== settings.name) center(settings.legalName);
  if (settings.address) center(settings.address);
  if (settings.phone) center(`Phone: ${settings.phone}`);
  if (settings.gstin) center(`GSTIN: ${settings.gstin}`);
  if (settings.fssai) center(`FSSAI: ${settings.fssai}`);
  const title = order.status === "void" ? "VOID BILL" : order.status === "held" ? "BILL - NOT PAID YET"
    : exempt && composition ? "BILL OF SUPPLY" : settings.gstin && !exempt ? "TAX INVOICE" : "";
  if (title) center(title, { bold: true });
  center(ORDER_TYPE[order.orderType] ?? order.orderType.toUpperCase(), { bold: true });
  if (order.status === "void" && order.voidReason) center(order.voidReason);
  L.push(rule(cols));

  const when = dateTime(order.createdAt);
  L.push({ text: plain(`Bill: ${order.billNo}`) });
  L.push({ text: `Date: ${when.date} ${when.time}` });
  const guest = [order.customer?.name, order.customer?.phone].filter(Boolean).join("/");
  if (guest) for (const t of wrap(`Guest: ${guest}`, cols)) L.push({ text: t });
  if (order.customer?.gstin) L.push({ text: plain(`Guest GSTIN: ${order.customer.gstin}`) });
  if (order.deliveryAddress) L.push({ text: plain(`Deliver to: ${order.deliveryAddress}`) });
  if (order.closedBy) L.push({ text: plain(`Cashier: ${order.closedBy}`) });
  const table = order.tableLabel ?? order.tableId;
  if (table) L.push({ text: plain(`Table: ${table}${order.source === "qr" ? " (QR order)" : ""}`), bold: true });
  if (order.tableSection) for (const text of wrap(`Section: ${order.tableSection}`, cols)) L.push({ text, bold: true });
  L.push(rule(cols));

  const c = itemColumns(cols);
  const nameW = cols - c.qty - c.rate - c.amt;
  L.push({ text: pad("Item", nameW) + lpad("Qty", c.qty) + (c.rate ? lpad("Rate", c.rate) : "") + lpad("Amt", c.amt), bold: true });
  L.push(rule(cols));
  let count = 0;
  for (const line of order.lines) {
    count += line.qty;
    const names = wrap(line.name, nameW - 1);
    const nums = lpad(qtyText(line.qty), c.qty) + (c.rate ? lpad(money(line.price), c.rate) : "") + lpad(money(line.price * line.qty), c.amt);
    L.push({ text: pad(names[0] ?? "", nameW) + nums });
    for (const more of names.slice(1)) L.push({ text: more });
    if (!c.rate && line.qty !== 1) L.push({ text: `  @ ${money(line.price)}` });
    if (line.note) for (const t of wrap(`  (${line.note})`, cols)) L.push({ text: t });
  }
  L.push(rule(cols));
  L.push(pair("Total qty", qtyText(count), cols));
  L.push(pair(order.tax?.inclusive && !exempt ? "Item total (GST incl.)" : "Item subtotal", money(order.subtotal), cols));
  if (order.discountAmt > 0) L.push(pair(`Discount ${order.discountPct}%`, `-${money(order.discountAmt)}`, cols));
  if ((order.serviceCharge ?? 0) > 0) L.push(pair(`Service charge ${order.serviceChargePct}%`, money(order.serviceCharge ?? 0), cols));
  if (!exempt && (order.cgst > 0 || order.sgst > 0)) {
    const rates = [...new Set(order.lines.map((l) => l.gstRate))];
    const half = rates.length === 1 ? ` ${(rates[0]! / 2).toString()}%` : "";
    L.push(pair(`CGST${half}`, money(order.cgst), cols));
    L.push(pair(`SGST${half}`, money(order.sgst), cols));
  }
  if (order.roundOff) L.push(pair("Round off", money(order.roundOff), cols));
  L.push(rule(cols));
  L.push(pair("TOTAL", money(order.total), cols / 2, { bold: true, size: "big" }));
  L.push(rule(cols));
  for (const p of order.payments) L.push(pair(p.mode === "credit" ? "Due" : `Paid by ${PAY[p.mode] ?? p.mode}`, money(p.amount), cols));
  const note = exempt ? exemptionNote(settings, order.orderType) : "";
  if (note) for (const t of wrap(note, cols)) L.push({ text: t, align: "center" });
  const due = order.status === "held" ? order.total : order.payments.filter((p) => p.mode === "credit").reduce((s, p) => s + p.amount, 0);
  const qr = settings.upiVpa && order.status !== "void" && due > 0 ? "upi" : undefined;
  L.push({ text: "" });
  center(settings.billFooter || "Thank you! Visit again.");
  center(order.source === "waiter" ? "Printed through XTSY Waiter" : "Billed with XTSY POS");
  if (qr) { L.push({ text: "" }); L.push({ text: `Scan to pay Rs.${money(due)} by UPI`, align: "center", bold: true }); }
  return { paper, lines: fitLines(L, cols), qr, endFeedMm, marginMm };
}

/** A kitchen ticket: big order type and table, then items in tall bold text with their quantities. */
export function kotSlip(kots: Kot[], layout: PaperOrLayout, header = "", large = true, endFeedMm = KOT_END_FEED_MM): Slip {
  const { paper, cols, marginMm } = layoutOf(layout);
  const first = kots[0];
  const L: SlipLine[] = [];
  if (!first) return { paper, lines: L, marginMm };
  const cancel = first.kind === "cancel";
  if (header) for (const t of wrap(header, cols)) L.push({ text: t, align: "center" });
  L.push({ text: cancel ? "CANCEL KOT" : "Running KOT", align: "center", bold: true, size: cancel ? "big" : "normal" });
  L.push({ text: ORDER_TYPE[first.orderType ?? "dine-in"] ?? "DINE IN", align: "left", bold: true, size: "big" });
  const table = first.tableLabel ?? first.tableId;
  if (table) for (const t of wrap(`TBL: ${table}`, cols / 2)) L.push({ text: t, bold: true, size: "big" });
  L.push(rule(cols));
  const when = dateTime(first.createdAt);
  if (first.billNo) L.push({ text: plain(`Bill: ${first.billNo}`) });
  if (first.kotNo) for (const text of wrap(first.kotNo, cols)) L.push({ text, bold: true });
  if (first.tableSection) for (const text of wrap(`Section: ${first.tableSection}`, cols)) L.push({ text, bold: true });
  // Date and time on their own lines when they don't both fit, so neither is ever cut.
  const stamp = `Date: ${when.date}  Time: ${when.time}`;
  for (const t of stamp.length <= cols ? [stamp] : [`Date: ${when.date}`, `Time: ${when.time}`]) L.push({ text: t });
  L.push(rule(cols));
  // Quantity first, on the left ("4 x Tawa Roti"): the kitchen reads it first, and a printer that
  // clips the right edge of the paper can never hide it.
  let total = 0;
  for (const k of kots) {
    if (kots.length > 1 || k.station) L.push({ text: plain(k.station.toUpperCase()), bold: true });
    L.push({ text: "Qty  Item", bold: true });
    for (const line of k.lines) {
      total += line.qty;
      const qty = `${qtyText(line.qty)} x `;
      const indent = " ".repeat(qty.length);
      const names = wrap(`${cancel ? "CANCEL " : ""}${line.name}`, Math.max(8, cols - qty.length));
      const size = large ? "tall" as const : "normal" as const;
      L.push({ text: qty + (names[0] ?? ""), bold: true, size });
      for (const more of names.slice(1)) L.push({ text: indent + more, bold: true, size });
      if (line.note) for (const t of wrap(`  NOTE: ${line.note}`, cols)) L.push({ text: t, bold: true });
    }
    L.push(rule(cols));
  }
  L.push({ text: `Total Qty: ${qtyText(total)}`, bold: true, size: "big" });
  L.push(rule(cols));
  return { paper, lines: fitLines(L, cols), startFeedMm: KOT_START_FEED_MM, endFeedMm, marginMm };
}

/**
 * Print width test: numbered rulers as wide as the paper can go. Staff read the last number printed in
 * full and set "Characters per line" to it, so every slip wraps inside what this printer really prints.
 */
export function widthTestSlip(layout: PaperOrLayout): Slip {
  const { paper, marginMm } = layoutOf(layout);
  const max = maxColumnsFor(paper);
  const digits = Array.from({ length: max }, (_, i) => String((i + 1) % 10)).join("");
  const tens = Array.from({ length: max }, (_, i) => ((i + 1) % 10 === 0 ? String(((i + 1) / 10) % 10) : " ")).join("");
  const L: SlipLine[] = [
    { text: "PRINT WIDTH TEST", bold: true },
    { text: `Paper ${paper} mm, margin ${marginMm} mm` },
    { text: "-".repeat(MIN_SLIP_COLS) },
    { text: tens, bold: true },
    { text: digits, bold: true },
    { text: "#".repeat(max), bold: true },
    { text: "-".repeat(MIN_SLIP_COLS) },
    { text: "Count to the last digit" },
    { text: "printed in full: that is" },
    { text: "Characters per line." },
    { text: "Example: 2 under 2 = 22." },
  ];
  return { paper, lines: L, marginMm, endFeedMm: KOT_END_FEED_MM };
}

/* ---------------- ESC/POS ---------------- */

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

/** ESC/POS bytes for a slip: works with practically every 58/80 mm thermal printer. */
export function escPos(slip: Slip, opts: { upiLink?: string; copies?: number; cutter?: "none" | "full" | "partial" } = {}): Uint8Array {
  const out: number[] = [];
  const push = (...b: number[]) => { out.push(...b); };
  const text = (s: string) => { for (const ch of plain(s)) out.push(ch.charCodeAt(0)); };
  const one = () => {
    push(ESC, 0x40); // initialise
    push(ESC, 0x4d, 0); // Font A: 32 columns on 58 mm / 48 on 80 mm
    if (slip.marginMm) { const dots = Math.round(slip.marginMm * 8); push(GS, 0x4c, dots & 0xff, dots >> 8); } // left margin (8 dots per mm)
    push(ESC, 0x32); // standard line spacing, independent of a previous job
    push(ESC, 0x74, 0x00); // code page PC437 (ASCII-safe)
    if (slip.startFeedMm) {
      push(GS, 0x50, 203, 203);
      let lead = Math.round(slip.startFeedMm * 203 / 25.4);
      while (lead > 0) { const chunk = Math.min(255, lead); push(ESC, 0x4a, chunk); lead -= chunk; }
    }
    for (const line of slip.lines) {
      push(ESC, 0x61, line.align === "center" ? 1 : line.align === "right" ? 2 : 0);
      push(ESC, 0x45, line.bold ? 1 : 0);
      push(GS, 0x21, line.size === "big" ? 0x11 : line.size === "tall" ? 0x01 : 0x00);
      text(line.text);
      push(LF);
    }
    push(GS, 0x21, 0x00, ESC, 0x45, 0);
    if (slip.qr && opts.upiLink) {
      // QR code (GS ( k): model 2, size 6, error level M.
      const data = Array.from(plain(opts.upiLink), (ch) => ch.charCodeAt(0));
      const len = data.length + 3;
      push(ESC, 0x61, 1);
      push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00);
      push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x06);
      push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31);
      push(GS, 0x28, 0x6b, len % 256, Math.floor(len / 256), 0x31, 0x50, 0x30, ...data);
      push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
      push(LF, ESC, 0x61, 0);
    }
    if (slip.endFeedMm !== undefined) {
      // Set the vertical motion unit to 1/203 inch, then feed the configured tear-off gap.
      // ESC J feeds without cutting. Cutter commands are opt-in after model-level verification.
      push(GS, 0x50, 203, 203);
      let dots = Math.round(slip.endFeedMm * 203 / 25.4);
      while (dots > 0) { const chunk = Math.min(255, dots); push(ESC, 0x4a, chunk); dots -= chunk; }
      if (opts.cutter === "full") push(GS, 0x56, 0x00);
      else if (opts.cutter === "partial") push(GS, 0x56, 0x01);
    } else {
      push(LF, LF, LF, LF);
      if (opts.cutter === "full") push(GS, 0x56, 0x00);
      else if (opts.cutter === "partial") push(GS, 0x56, 0x01);
    }
  };
  for (let i = 0; i < Math.max(1, Math.min(5, opts.copies ?? 1)); i++) one();
  return Uint8Array.from(out);
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Android intent that hands the bytes to the RawBT print service (prints with no preview when set to). */
export function rawbtIntent(bytes: Uint8Array): string {
  return `intent:base64,${toBase64(bytes)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}


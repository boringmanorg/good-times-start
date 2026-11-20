/**
 * The restaurant's audit log in plain words. Pure, tested in audit-story.test.ts.
 *
 * The cloud records every saved change (restaurant_audit_log). Most of those are routine
 * book-keeping a person never needs to read: a table turning busy/free, a KOT getting its bill
 * number, numbering ids. `storyOf` turns each entry into one readable line ("Bill POS/0055
 * settled · ₹340 · UPI ₹340") and marks the routine ones, which the screen hides unless asked.
 * Secrets (the admin code key, old PIN) are never shown.
 */
import { PURCHASE_PAY_MODES } from "./purchase-pay-logic";
import { kindLabel, lineChanges, valueText, fieldLabel, type AuditEntry } from "./audit-log";

export type StoryTone = "add" | "change" | "remove" | "money" | "warn";
export interface Story { title: string; details: string[]; tone: StoryTone; routine: boolean }

type D = Record<string, unknown>;
const obj = (v: unknown): D => (v && typeof v === "object" && !Array.isArray(v) ? (v as D) : {});
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const rupees = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", wallet: "Wallet / Swiggy / Zomato", credit: "Due", points: "Points", gift_card: "Gift card", bank: "Bank", other: "Other" };

const SECRET = /(code|pin|token|secret|key|password)$/i;
/** Fields that only keep the system's own books; a change to only these is routine. */
const ROUTINE: Record<string, Set<string>> = {
  order: new Set(["numberRequestId", "kotSubmittedQty", "tableSection", "customerId", "settledDeviceId", "version", "updatedAt", "synced", "printedAt", "billNo", "subtotal", "discountAmt", "taxable", "cgst", "sgst", "igst", "total", "roundOff", "closedBy", "heldBy", "heldAt", "heldDevice"]),
  kot: new Set(["billNo", "status", "numberRequestId", "orderUid", "orderId", "seenAt", "printedAt", "version", "updatedAt", "synced", "tableSection"]),
  table: new Set(["heldAt", "heldBy", "heldDevice", "runningTotal", "since", "status", "version", "updatedAt", "synced"]),
  any: new Set(["version", "updatedAt", "synced"]),
};

const payText = (v: unknown): string => {
  const list = Array.isArray(v) ? (v as D[]) : [];
  if (!list.length) return "no payment (NC)";
  return list.map((p) => `${PAY[s(p["mode"])] ?? s(p["mode"])} ${rupees(p["amount"])}`).join(" + ");
};
const payTotal = (v: unknown) => (Array.isArray(v) ? (v as D[]) : []).reduce((t, p) => t + Number(p["amount"] ?? 0), 0);
const itemsText = (lines: unknown, max = 3): string => {
  const list = Array.isArray(lines) ? (lines as D[]) : [];
  const shown = list.slice(0, max).map((l) => `${s(l["name"]) || "item"} ×${s(l["qty"] ?? 1)}`);
  return list.length > max ? `${shown.join(", ")} +${list.length - max} more` : shown.join(", ");
};
const ORDER_TYPE: Record<string, string> = { takeaway: "Takeaway", delivery: "Delivery", swiggy: "Swiggy", zomato: "Zomato" };
const place = (p: D) => s(p["tableLabel"]) || s(p["tableId"]) || ORDER_TYPE[s(p["orderType"])] || "";
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/** Readable "Field: a → b" lines for ordinary fields, secrets masked, routine fields dropped. */
function fieldLines(entry: AuditEntry, skip: Set<string>): string[] {
  return entry.changes.filter((c) => !skip.has(c.field) && !ROUTINE["any"]!.has(c.field)).flatMap((c) => {
    if (SECRET.test(c.field)) return [`${fieldLabel(c.field)} changed (hidden)`];
    if ((c.field === "lines" || c.field === "items") && (Array.isArray(c.from) || Array.isArray(c.to))) {
      const d = lineChanges(c.from, c.to);
      return d.length ? d.map((x) => `Items: ${x}`) : [];
    }
    if (c.field === "customer") {
      const who = (v: unknown) => [s(obj(v)["name"]), s(obj(v)["phone"])].filter(Boolean).join(" ") || "—";
      return [`Guest: ${who(c.from)} → ${who(c.to)}`];
    }
    const a = valueText(c.field, c.from), b = valueText(c.field, c.to);
    return a === b ? [`${fieldLabel(c.field)} changed`] : [`${fieldLabel(c.field)}: ${a} → ${b}`];
  });
}

function changed(entry: AuditEntry): Map<string, { from?: unknown; to?: unknown }> {
  return new Map(entry.changes.map((c) => [c.field, { from: c.from, to: c.to }]));
}

function created(entry: AuditEntry): D {
  return obj(entry.changes.find((c) => c.field === "*")?.to);
}

function orderStory(e: AuditEntry): Story {
  const name = e.label || "a bill";
  if (e.action === "created") {
    const p = created(e);
    const where = place(p);
    const guest = s(obj(p["customer"])["name"]);
    const platform = s(p["orderType"]) === "swiggy" || s(p["orderType"]) === "zomato";
    return { title: platform ? `${where} order opened` : `Bill opened${where ? ` · ${where}` : ""}`, details: [itemsText(p["lines"]), guest ? `Guest ${guest}` : ""].filter(Boolean), tone: "add", routine: false };
  }
  if (e.action === "deleted") return { title: `Bill removed: ${name}`, details: [], tone: "remove", routine: false };
  if (e.action === "restored") return { title: `Bill restored: ${name}`, details: [], tone: "warn", routine: false };
  const c = changed(e);
  const status = c.get("status");
  if (status?.to === "settled" && status.from !== "settled") {
    const pay = c.get("payments")?.to;
    const total = c.get("total")?.to ?? payTotal(pay);
    return { title: `Bill ${name} settled · ${rupees(total)}`, details: [payText(pay)], tone: "money", routine: false };
  }
  if (status?.to === "void") return { title: `Bill ${name} cancelled`, details: [s(c.get("voidReason")?.to) ? `Reason: ${s(c.get("voidReason")?.to)}` : ""].filter(Boolean), tone: "remove", routine: false };
  if (c.has("amendments")) {
    const list = Array.isArray(c.get("amendments")?.to) ? (c.get("amendments")!.to as D[]) : [];
    const last = obj(list[list.length - 1]);
    return { title: `Payment corrected on ${name}`, details: [`Now ${payText(c.get("payments")?.to ?? obj(last["to"])["payments"])}`, s(last["reason"]) ? `Reason: ${s(last["reason"])}` : ""].filter(Boolean), tone: "warn", routine: false };
  }
  const lines = fieldLines(e, ROUTINE["order"]!).map((l) => l.replace(/^Discount Pct/, "Discount %"));
  if (!lines.length) return { title: `Bill ${name} updated`, details: [], tone: "change", routine: true };
  return { title: `Bill ${e.label ? name : "running"} changed`, details: lines, tone: "change", routine: false };
}

function kotStory(e: AuditEntry): Story {
  if (e.action === "created") {
    const p = created(e);
    const cancel = s(p["kind"]) === "cancel";
    const where = place(p);
    return { title: `${s(p["kotNo"]) || "KOT"} ${cancel ? "cancelled items" : "sent"}${where ? ` · ${where}` : ""}${s(p["station"]) ? ` · ${s(p["station"])}` : ""}`, details: [itemsText(p["lines"])].filter(Boolean), tone: cancel ? "remove" : "add", routine: false };
  }
  if (e.action === "deleted") return { title: `Kitchen ticket removed`, details: [], tone: "remove", routine: false };
  const lines = fieldLines(e, ROUTINE["kot"]!);
  return lines.length ? { title: "Kitchen ticket edited", details: lines, tone: "change", routine: false } : { title: "Kitchen ticket updated", details: [], tone: "change", routine: true };
}

function tableStory(e: AuditEntry): Story {
  const name = e.label || "table";
  if (e.action === "created") return { title: `Table added: ${name}`, details: [], tone: "add", routine: false };
  if (e.action === "deleted") return { title: `Table removed: ${name}`, details: [], tone: "remove", routine: false };
  const lines = fieldLines(e, ROUTINE["table"]!);
  return lines.length ? { title: `Table ${name} changed`, details: lines, tone: "change", routine: false } : { title: `Table ${name} busy/free`, details: [], tone: "change", routine: true };
}

function settingsStory(e: AuditEntry): Story {
  if (e.action === "created") return { title: "Restaurant details saved for the first time", details: [], tone: "add", routine: false };
  const known: Record<string, string> = {
    adminCode: "Admin code key renewed (all older codes stop working)", adminPin: "Old admin PIN changed", rolePolicy: "Role permissions changed",
    paymentModes: "Payment modes changed", marketingDevices: "Marketing terminals changed",
  };
  const details = e.changes.flatMap((c) => {
    if (ROUTINE["any"]!.has(c.field)) return [];
    if (known[c.field]) return [known[c.field]!];
    return fieldLines({ ...e, changes: [c] }, new Set());
  });
  return { title: "Settings changed", details, tone: details.some((d) => d.startsWith("Admin code") || d.startsWith("Role")) ? "warn" : "change", routine: !details.length };
}

function purchaseStory(e: AuditEntry): Story {
  const p = created(e);
  const items = Array.isArray(p["items"]) ? (p["items"] as D[]) : [];
  const total = items.reduce((t, i) => t + Math.abs(Number(i["qty"] ?? 0)) * Number(i["unitCost"] ?? 0), 0);
  const pays = (Array.isArray(p["payments"]) ? (p["payments"] as D[]) : [])
    .map((x) => `${PURCHASE_PAY_MODES.find((m) => m.v === s(x["mode"]))?.short ?? s(x["mode"])} ${rupees(x["amount"])}`).join(" + ");
  const vendor = s(p["supplierName"]);
  const ret = s(p["type"]) === "return" || !!s(p["purchaseId"]);
  const names = items.slice(0, 3).map((i) => `${s(i["name"]) || "item"} ${Math.abs(Number(i["qty"] ?? 0))}${s(i["unit"]) ? ` ${s(i["unit"])}` : ""}`).join(", ");
  return {
    title: `${ret ? "Returned to" : "Purchase from"} ${vendor || "a vendor"} · ${rupees(total)}`,
    details: [names + (items.length > 3 ? ` +${items.length - 3} more` : ""), pays, s(p["reference"]) ? `Invoice ${s(p["reference"])}` : ""].filter(Boolean),
    tone: ret ? "remove" : "money", routine: false,
  };
}

function generic(e: AuditEntry): Story {
  const what = kindLabel(e.kind);
  if (e.kind === "stock_entry" && e.action === "created" && ["purchase", "return"].includes(s(created(e)["type"]))) return purchaseStory(e);
  const name = e.label && !UID.test(e.label) ? `: ${e.label}` : "";
  if (e.action === "created") {
    const p = created(e);
    const extra = e.kind === "menu" ? [s(p["price"]) ? rupees(p["price"]) : ""] : e.kind === "stock_entry" ? [s(p["supplierName"]), s(p["reference"]) ? `#${s(p["reference"])}` : ""] : e.kind === "customer" ? [s(p["phone"])] : [];
    return { title: `${what} added${name}`, details: [extra.filter(Boolean).join(" · ")].filter(Boolean), tone: "add", routine: false };
  }
  if (e.action === "deleted") return { title: `${what} removed${name}`, details: [], tone: "remove", routine: false };
  if (e.action === "restored") return { title: `${what} restored${name}`, details: [], tone: "warn", routine: false };
  if (e.kind === "stock_entry") {
    const a = obj(changed(e).get("approval")?.to);
    if (s(a["status"]) === "approved") return { title: `Purchase approved${name}`, details: [], tone: "money", routine: false };
    if (s(a["status"]) === "rejected") return { title: `Purchase rejected${name}`, details: [s(a["reason"]) ? `Reason: ${s(a["reason"])}` : ""].filter(Boolean), tone: "remove", routine: false };
  }
  const lines = fieldLines(e, new Set());
  return { title: `${what} changed${name}`, details: lines, tone: "change", routine: !lines.length };
}

function ledgerStory(e: AuditEntry): Story {
  if (e.action === "created") {
    const p = created(e);
    const mode = PAY[s(p["mode"])] ?? s(p["mode"]);
    const what = s(p["type"]) === "vendor_payment" ? `Paid ${s(p["supplierName"]) || "vendor"}` : s(p["type"]) === "income" ? "Money in" : `Expense: ${s(p["category"]).replace(/_/g, " ")}`;
    return { title: `${what} · ${rupees(p["amount"])} · ${mode}`, details: [s(p["note"])].filter(Boolean), tone: "money", routine: false };
  }
  const v = obj(changed(e).get("void")?.to);
  if (s(v["reason"])) return { title: "Accounts entry voided", details: [`Reason: ${s(v["reason"])}`], tone: "remove", routine: false };
  return generic(e);
}

export function storyOf(e: AuditEntry): Story {
  if (e.kind === "ledger") return ledgerStory(e);
  if (e.kind === "order") return orderStory(e);
  if (e.kind === "kot") return kotStory(e);
  if (e.kind === "table") return tableStory(e);
  if (e.kind === "settings") return settingsStory(e);
  return generic(e);
}

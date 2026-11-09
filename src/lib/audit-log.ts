import { supabase } from "@/integrations/supabase/client";

/** One change written by the cloud: who, which terminal, what and which fields. Owners and managers only. */
export interface AuditEntry {
  id: number; at: string; user_id: string | null; user_email: string | null; device_id: string | null;
  kind: string; record_id: string; action: "created" | "changed" | "deleted" | "restored"; label: string | null;
  changes: { field: string; from?: unknown; to?: unknown }[];
}
export interface AuditFilter { from: Date; to: Date; device?: string; kind?: string }

export const AUDIT_PAGE = 200;

export async function loadAuditLog(restaurantId: string, filter: AuditFilter, before?: number): Promise<AuditEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from("restaurant_audit_log")
    .select("id, at, user_id, user_email, device_id, kind, record_id, action, label, changes")
    .eq("restaurant_id", restaurantId).gte("at", filter.from.toISOString()).lt("at", filter.to.toISOString())
    .order("id", { ascending: false }).limit(AUDIT_PAGE);
  if (filter.device) q = filter.device === "none" ? q.is("device_id", null) : q.eq("device_id", filter.device);
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (before) q = q.lt("id", before);
  const { data, error } = await q;
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? "") ? "The audit log isn't set up in the cloud yet." : "Couldn't load the audit log. Check the internet.");
  return (data ?? []) as AuditEntry[];
}

export const AUDIT_KINDS: { v: string; l: string }[] = [
  { v: "order", l: "Bills" }, { v: "kot", l: "Kitchen tickets" }, { v: "menu", l: "Menu" }, { v: "table", l: "Tables & rooms" },
  { v: "material", l: "Purchase items" }, { v: "stock_entry", l: "Purchases & returns" }, { v: "supplier", l: "Vendors" },
  { v: "customer", l: "Guests" }, { v: "settings", l: "Settings" }, { v: "day_close", l: "Day close" }, { v: "inventory", l: "Inventory" },
];
const KIND_ONE: Record<string, string> = {
  order: "Bill", kot: "Kitchen ticket", menu: "Menu item", table: "Table / room", material: "Purchase item", stock_entry: "Purchase / return",
  supplier: "Vendor", customer: "Guest", settings: "Settings", day_close: "Day close", inventory: "Inventory",
};
export function kindLabel(kind: string): string { return KIND_ONE[kind] ?? kind; }

const FIELD_LABELS: Record<string, string> = {
  price: "Price", name: "Name", category: "Section", station: "Station", veg: "Veg", available: "Available", gstRate: "GST %",
  costPerUnit: "Standard price", unit: "Unit", lines: "Items", items: "Items", status: "Status", billNo: "Bill no.", kotNo: "KOT no.",
  payments: "Payments", discount: "Discount", total: "Total", tableId: "Table", tableLabel: "Table", customerName: "Guest name",
  customerPhone: "Guest phone", note: "Note", label: "Name", section: "Section", seats: "Seats", phone: "Phone", gstin: "GSTIN",
  settledAt: "Settled at", printedAt: "Printed at", serviceCharge: "Service charge", variants: "Options", addons: "Add-ons",
};
export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

const MONEY = new Set(["price", "costPerUnit", "total", "discount", "subtotal", "serviceCharge", "unitCost"]);
/** A short readable value; lists and objects are summarised, not dumped. */
export function valueText(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return MONEY.has(field) ? `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : String(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) || (/At$/.test(field) && /^\d{13}$/.test(value))) return new Date(value).toLocaleString("en-IN");
    return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "entry" : "entries"}`;
  return "details";
}

/** Item lines that differ between two versions of a bill or KOT, e.g. "Masala Dosa 1 → 2", "+ Curd Rice ×1". */
export function lineChanges(from: unknown, to: unknown): string[] {
  const read = (v: unknown) => new Map((Array.isArray(v) ? v : []).filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => [String(l["uid"] ?? l["lineId"] ?? `${String(l["itemId"] ?? l["materialId"] ?? l["name"])}|${String(l["variantId"] ?? "")}`), l]));
  const a = read(from), b = read(to), out: string[] = [];
  const name = (l: Record<string, unknown>) => String(l["name"] ?? l["itemId"] ?? l["materialId"] ?? "item");
  for (const [k, l] of b) {
    const before = a.get(k);
    if (!before) out.push(`+ ${name(l)} ×${String(l["qty"] ?? 1)}`);
    else if (before["qty"] !== l["qty"]) out.push(`${name(l)} ${String(before["qty"])} → ${String(l["qty"])}`);
    else if (before["price"] !== l["price"]) out.push(`${name(l)} price ₹${String(before["price"])} → ₹${String(l["price"])}`);
  }
  for (const [k, l] of a) if (!b.has(k)) out.push(`− ${name(l)} ×${String(l["qty"] ?? 1)}`);
  return out;
}

/** Plain-language lines for one log entry. */
export function changeLines(entry: AuditEntry): string[] {
  if (entry.action === "created") return [];
  if (entry.action !== "changed") return [];
  return entry.changes.flatMap((c) => {
    if ((c.field === "lines" || c.field === "items") && (Array.isArray(c.from) || Array.isArray(c.to))) {
      const detail = lineChanges(c.from, c.to);
      return detail.length ? detail.map((d) => `Items: ${d}`) : [`${fieldLabel(c.field)} changed`];
    }
    const a = valueText(c.field, c.from), b = valueText(c.field, c.to);
    return a === b ? [`${fieldLabel(c.field)} changed`] : [`${fieldLabel(c.field)}: ${a} → ${b}`];
  });
}

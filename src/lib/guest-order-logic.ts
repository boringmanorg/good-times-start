/** Guest ordering (QR at the table, online pickup): shapes and pure helpers shared by the guest page and the POS. */
import type { Branding } from "./marketing-logic";
import type { CartLine, MenuItem, Order, OrderType } from "./types";
import { buildLine } from "./menu-logic";
import { computeTotals } from "./billing";
import { mergeSentLines } from "./sync-core";
import { accumulateSubmittedQuantities } from "./kitchen-order";

export type GuestChannel = "table" | "online";
export type GuestStatus = "new" | "accepted" | "ready" | "completed" | "rejected" | "cancelled";

/** One dish as the guest chose it; price and name are set by the database from the menu. */
export interface GuestLine {
  itemId: string;
  variantId?: string;
  addonIds?: string[];
  qty: number;
  note?: string;
  name: string;
  price: number;
  veg?: boolean;
}

/** A guest_orders row as the POS reads it. */
export interface GuestOrder {
  id: string;
  restaurant_id: string;
  code: string;
  channel: GuestChannel;
  table_id: string | null;
  table_label: string | null;
  customer_name: string;
  customer_phone: string;
  note: string;
  pickup_at: string | null;
  lines: GuestLine[];
  subtotal: number;
  payment: "counter" | "upi";
  upi_ref: string;
  status: GuestStatus;
  reason: string;
  order_uid: string | null;
  bill_no: string | null;
  handled_by: string;
  created_at: string;
  updated_at: string;
  whatsapp_opt_in?: boolean;
  source?: string;
  /** Server-assigned QR series number (QR/0001…); null for orders placed before the series. */
  qr_no?: number | null;
  /** Public QR orders: dine-in (staff seat the guest), takeaway or delivery. Null = table/room QR or older pickup. */
  order_type?: PublicOrderType | null;
  delivery_address?: string | null;
  delivery_landmark?: string | null;
  /** Prepaid QR orders: where the payment stands. See guest-payment-logic.ts. */
  pay_state?: string | null;
  pay_proof?: string | null;
  paid_at?: string | null;
  confirmed_at?: string | null;
}

/** What a guest can order from the public QR. */
export type PublicOrderType = "dine-in" | "takeaway" | "delivery";
export const PUBLIC_ORDER_TYPES: { id: PublicOrderType; label: string; hint: string }[] = [
  { id: "dine-in", label: "Dine in", hint: "Order now, we'll seat you." },
  { id: "takeaway", label: "Takeaway", hint: "Order ahead, pick it up." },
  { id: "delivery", label: "Delivery", hint: "We bring it to your door." },
];
export function isPublicOrderType(value: unknown): value is PublicOrderType {
  return value === "dine-in" || value === "takeaway" || value === "delivery";
}

/** QR/0001-style label for a guest order's QR series number. */
export function qrSeriesLabel(n: number | null | undefined): string | undefined {
  return typeof n === "number" && n > 0 ? `QR/${String(n).padStart(4, "0")}` : undefined;
}

/** A dish on the public menu (recipes and costs removed by the database). */
export interface StorefrontItem extends Omit<MenuItem, "prices" | "recipe" | "stockTracked"> {
  takeawayPrice?: number | null;
}

export interface Storefront {
  id: string;
  slug: string;
  name: string;
  address: string;
  phone: string;
  fssai: string;
  upiVpa: string;
  gstMode: "regular" | "composition" | "unregistered";
  pricesIncludeGst: boolean;
  categoryOrder: string[];
  qr: boolean;
  online: boolean;
  paused: boolean;
  prepMinutes: number;
  minOrder: number;
  message: string;
  live: boolean;
  menu: StorefrontItem[];
  tables: { id: string; label: string; section: string }[];
  /** Room service by QR settings; absent until the outlet's storefront exposes them. */
  rooms?: import("./room-logic").RoomOrdering;
  branding?: Branding;
}

export const GUEST_STATUS_LABEL: Record<GuestStatus, string> = {
  new: "Sent to the kitchen",
  accepted: "Accepted. Cooking now.",
  ready: "Ready",
  completed: "Served. Enjoy!",
  rejected: "Not accepted",
  cancelled: "Cancelled",
};

/** A table or room QR is always dine-in; a public order is what the guest picked (pickup for older orders). */
export function orderTypeFor(channel: GuestChannel, publicType?: PublicOrderType | null): OrderType {
  return channel === "table" ? "dine-in" : publicType ?? "takeaway";
}

/** Turn a public dish back into a menu item so the POS's own pricing and option screens work on it. */
/** Dishes a guest can order: each needs its own id, or every id-less dish would share one cart counter. */
export function guestMenuItems(menu: StorefrontItem[]): MenuItem[] {
  return menu.filter((item) => typeof item.id === "string" && item.id.length > 0).map(asMenuItem);
}

export function asMenuItem(item: StorefrontItem): MenuItem {
  const { takeawayPrice, ...rest } = item;
  return {
    ...rest,
    gstRate: rest.gstRate ?? 5,
    station: rest.station ?? "Kitchen",
    available: rest.available ?? true,
    ...(typeof takeawayPrice === "number" ? { prices: { takeaway: takeawayPrice } } : {}),
  };
}

/** The guest's cart, keyed like bill lines so the same dish with the same options adds up. */
export interface GuestCartLine extends GuestLine { key: string }

export function guestLineFor(item: MenuItem, channel: GuestChannel, variantId?: string, addonIds: string[] = [], publicType?: PublicOrderType | null): GuestCartLine {
  const line = buildLine(item, orderTypeFor(channel, publicType), variantId, addonIds);
  return {
    key: line.itemId,
    itemId: item.id,
    ...(variantId ? { variantId } : {}),
    ...(addonIds.length ? { addonIds: [...addonIds].sort() } : {}),
    qty: 1,
    name: line.name,
    price: line.price,
    veg: line.veg,
  };
}

export function addToGuestCart(cart: GuestCartLine[], line: GuestCartLine): GuestCartLine[] {
  const found = cart.find((l) => l.key === line.key);
  if (found) return cart.map((l) => (l.key === line.key ? { ...l, qty: Math.min(30, l.qty + line.qty) } : l));
  return [...cart, line];
}

export function setGuestQty(cart: GuestCartLine[], key: string, qty: number): GuestCartLine[] {
  return qty <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, qty: Math.min(30, qty) } : l));
}

export function guestSubtotal(lines: { price: number; qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

/** What the guest sends: ids and quantities only. The database prices it. */
export function guestOrderPayload(cart: GuestCartLine[]) {
  return cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId ?? null, addonIds: l.addonIds ?? [], qty: l.qty, note: l.note ?? "" }));
}

/**
 * Bill lines for an accepted guest order, priced from this device's menu (the
 * restaurant's source of truth). A dish no longer on the menu keeps the
 * guest's line so nothing they ordered is lost; it is reported back.
 */
export function cartLinesFromGuest(lines: GuestLine[], menu: MenuItem[], channel: GuestChannel, publicType?: PublicOrderType | null): { lines: CartLine[]; missing: string[] } {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const out: CartLine[] = [];
  const missing: string[] = [];
  const fallbackStation = menu[0]?.station ?? "Kitchen";
  for (const g of lines) {
    const item = byId.get(g.itemId);
    const variantOk = !item?.variants?.length || item.variants.some((v) => v.id === g.variantId);
    let line: CartLine;
    if (item && variantOk) {
      line = { ...buildLine(item, orderTypeFor(channel, publicType), g.variantId, g.addonIds ?? []), qty: g.qty };
    } else {
      missing.push(g.name);
      line = { itemId: `guest:${g.itemId}:${g.variantId ?? ""}:${(g.addonIds ?? []).join(",")}`, menuItemId: g.itemId, name: g.name, price: g.price, qty: g.qty, veg: g.veg ?? false, gstRate: 5, station: fallbackStation };
    }
    if (g.note) line.note = g.note;
    // One line per dish and options, as at the counter; notes for the same dish are joined.
    const same = out.find((l) => l.itemId === line.itemId);
    if (same) {
      same.qty += line.qty;
      if (line.note && line.note !== same.note) same.note = same.note ? `${same.note}; ${line.note}` : line.note;
    } else out.push(line);
  }
  return { lines: out, missing };
}

export function orderPageUrl(origin: string, slug: string, tableId?: string, source?: string): string {
  const base = `${origin.replace(/\/$/, "")}/order/${encodeURIComponent(slug)}`;
  const query = [tableId ? `table=${encodeURIComponent(tableId)}` : "", source ? `s=${encodeURIComponent(source)}` : ""].filter(Boolean).join("&");
  return query ? `${base}?${query}` : base;
}

/** Pickup times offered to the guest, from the kitchen's usual preparation time. */
export function pickupChoices(now: Date, prepMinutes: number): { label: string; at: string | null }[] {
  const choices: { label: string; at: string | null }[] = [{ label: `As soon as possible (about ${prepMinutes} min)`, at: null }];
  const first = new Date(now.getTime() + Math.max(prepMinutes, 15) * 60_000);
  first.setMinutes(Math.ceil(first.getMinutes() / 15) * 15, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    const at = new Date(first.getTime() + i * 15 * 60_000);
    choices.push({ label: at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }), at: at.toISOString() });
  }
  return choices;
}

/** Guest orders newest first, with waiting ones on top. */
export function sortGuestOrders(orders: GuestOrder[]): GuestOrder[] {
  const rank: Record<GuestStatus, number> = { new: 0, accepted: 1, ready: 2, completed: 3, rejected: 4, cancelled: 5 };
  return [...orders].sort((a, b) => rank[a.status] - rank[b.status] || b.created_at.localeCompare(a.created_at));
}

/**
 * The running bill after an accepted guest order: added to the table's open
 * bill when there is one, otherwise a new bill. Every guest line goes to the
 * kitchen at once, so it counts as sent.
 */
export function billWithGuestLines(
  base: Order | null,
  added: CartLine[],
  fresh: Omit<Order, "lines" | "subtotal" | "discountAmt" | "cgst" | "sgst" | "roundOff" | "total" | "taxable" | "serviceCharge" | "kotSubmittedQty">,
  code: string,
): Order {
  const lines = base ? mergeSentLines(base.lines, added) : added.map((l) => ({ ...l }));
  const order: Order = base ? { ...base } : { ...fresh, lines: [], subtotal: 0, discountAmt: 0, cgst: 0, sgst: 0, roundOff: 0, total: 0 };
  const t = computeTotals(lines, order.discountPct, order.serviceChargePct ?? 0, order.tax ?? {});
  return {
    ...order,
    lines,
    subtotal: t.subtotal, discountAmt: t.discountAmt, serviceCharge: t.serviceCharge, taxable: t.taxable,
    cgst: t.cgst, sgst: t.sgst, roundOff: t.roundOff, total: t.total,
    kotSubmittedQty: accumulateSubmittedQuantities(base?.kotSubmittedQty ?? {}, added),
    guestCodes: [...(base?.guestCodes ?? []), code],
    status: "held",
    synced: false,
  };
}

/**
 * Where a guest QR order stands for the Bookings history: waiting, rejected or cancelled
 * by the guest, or its bill's state, showing the POS number once the bill is settled.
 */
export function qrOrderState(guest: Pick<GuestOrder, "status">, bill?: Pick<Order, "status" | "billNo"> | null): { label: string; tone: "pending" | "running" | "settled" | "closed" } {
  if (guest.status === "new") return { label: "Waiting to accept", tone: "pending" };
  if (guest.status === "rejected") return { label: "Rejected", tone: "closed" };
  if (guest.status === "cancelled") return { label: "Cancelled by guest", tone: "closed" };
  if (bill?.status === "settled") return { label: bill.billNo ? `Settled · ${bill.billNo}` : "Settled", tone: "settled" };
  if (bill?.status === "void") return { label: "Bill cancelled", tone: "closed" };
  if (guest.status === "completed") return { label: "Closed", tone: "closed" };
  return { label: "Running", tone: "running" };
}

/**
 * Tables a guest can pick on the QR ordering page: dining tables only, in floor order.
 * Hostel rooms ("Rooms" section) are never offered, though a room's own QR code
 * still works; the table the guest scanned is always kept in the list.
 */
export function guestTableChoices<T extends { id: string; label: string; section: string }>(tables: T[], currentId?: string): T[] {
  const isRoom = (t: T) => /^rooms?$/i.test(t.section.trim());
  return tables
    .filter((t) => !isRoom(t) || t.id === currentId)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}


/**
 * What a still-open QR order (accepted or ready) becomes once its bill is finished on any terminal:
 * settled → completed with the bill's POS number; cancelled or removed → cancelled. Null = leave it.
 */
export function guestOrderClosing(
  guest: Pick<GuestOrder, "status">,
  bill: { status: "settled" | "void"; billNo: string } | undefined,
): { status: "completed" | "cancelled"; reason: string; billNo: string } | null {
  if (!bill || (guest.status !== "accepted" && guest.status !== "ready")) return null;
  return bill.status === "void"
    ? { status: "cancelled", reason: "Bill cancelled by restaurant", billNo: "" }
    : { status: "completed", reason: "", billNo: bill.billNo };
}

/** After this long without staff confirming, the guest is told the kitchen is busy (and not to order again). */
export const GUEST_BUSY_AFTER_MS = 60_000;

/** What the guest reads while their order waits for the restaurant to confirm it. */
export function guestWaitMessage(createdAt: string, now: number): { busy: boolean; text: string } {
  const waited = now - Date.parse(createdAt);
  return waited >= GUEST_BUSY_AFTER_MS
    ? { busy: true, text: "The kitchen is busy right now. You're in the queue and the team will confirm your order shortly. No need to order again." }
    : { busy: false, text: "Sent. The team confirms most orders within a minute." };
}

/**
 * Which QR a guest scanned. Both open straight on the menu. In-house (hotel guests): the room is
 * chosen at checkout (open rooms only, no status). Public (shared): dine-in, takeaway or delivery,
 * with "Book a table" one tap away; no tables or rooms are listed. A table or room QR (?table=)
 * goes straight to its menu.
 */
export type GuestEntry = "inhouse" | "public";
export function guestEntry(search: { for?: string | undefined }): GuestEntry {
  return search.for === "stay" ? "inhouse" : "public";
}

/** Both QRs open straight on the menu; the public one starts as dine-in until the guest switches. */
export function publicTypeFrom(mode: unknown): PublicOrderType {
  return isPublicOrderType(mode) ? mode : "dine-in";
}

/** Which details a guest must give before placing an order. */
export interface GuestRequired { name: boolean; phone: boolean; room: boolean; party: boolean; pickup: boolean; address: boolean; pin: boolean }
export function guestRequired(opts: { stay: boolean; roomTable: boolean; channel: GuestChannel; kind: PublicOrderType | null }): GuestRequired {
  const roomGuest = opts.stay || opts.roomTable;
  const online = opts.channel === "online";
  return {
    name: roomGuest || online,
    phone: roomGuest || online,
    room: opts.stay,
    party: online && opts.kind === "dine-in",
    pickup: online && opts.kind === "takeaway",
    address: online && opts.kind === "delivery",
    pin: online && opts.kind === "delivery",
  };
}

/* ---- Delivery map pin (Google Maps) ---- */

const MAP_LINE = "\nMap: ";
/** A Google Maps link for a dropped pin. */
export function mapPinUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
/** Coordinates from a pin link we made (or any ?q=lat,lng / @lat,lng Google Maps link), for the map preview. */
export function pinCoords(url: string): { lat: number; lng: number } | null {
  const m = /[?&]q=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(url) ?? /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(url);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
/** A Google Maps link the guest pasted or shared (maps.app.goo.gl, goo.gl/maps, google.com/maps, maps.google.com). */
export function cleanMapLink(text: string): string | null {
  const m = /https?:\/\/(?:maps\.app\.goo\.gl\/[\w-]+|goo\.gl\/maps\/[\w-]+|(?:www\.)?google\.[a-z.]+\/maps[^\s]*|maps\.google\.[a-z.]+\/[^\s]*)/i.exec(text.trim());
  return m && m[0].length <= 160 ? m[0] : null;
}
/** The delivery address as stored: what the guest typed, then the map pin on its own line (fits the 240-character column). */
export function withMapPin(address: string, pin: string): string {
  const line = `${MAP_LINE}${pin}`;
  return `${address.trim().slice(0, Math.max(0, 240 - line.length))}${line}`;
}
/** Splits a stored delivery address back into the address and its map pin. */
export function splitMapPin(stored: string | null | undefined): { address: string; pin: string | null } {
  const text = stored ?? "";
  const at = text.lastIndexOf(MAP_LINE);
  if (at < 0) return { address: text, pin: null };
  return { address: text.slice(0, at), pin: text.slice(at + MAP_LINE.length).trim() || null };
}

/** The kitchen-ticket note for an accepted public order: pickup time, delivery address or seating. */
export function publicOrderNote(guest: Pick<GuestOrder, "code" | "channel" | "order_type" | "pickup_at" | "note" | "delivery_address" | "delivery_landmark">): string {
  const extra = guest.note ? `: ${guest.note}` : "";
  if (guest.channel !== "online") return guest.note ? `${guest.code}${extra}` : "";
  if (guest.order_type === "delivery") {
    const where = [splitMapPin(guest.delivery_address).address, guest.delivery_landmark ? `near ${guest.delivery_landmark}` : ""].filter(Boolean).join(", ");
    return `${guest.code} delivery to ${where}${extra}`;
  }
  if (guest.order_type === "dine-in") return `${guest.code} dine-in${extra}`;
  const at = guest.pickup_at ? ` at ${new Date(guest.pickup_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "";
  return `${guest.code} pickup${at}${extra}`;
}

/** A public dine-in order has no table yet: staff pick one when accepting. */
export function needsTableOnAccept(guest: Pick<GuestOrder, "channel" | "order_type">): boolean {
  return guest.channel === "online" && guest.order_type === "dine-in";
}

/** Tables staff can seat a public dine-in guest at: dining tables only (rooms are for hotel guests), busy ones marked. */
export function seatingChoices(tables: { id: string; label: string; section?: string; seats?: number; status?: string; deleted?: boolean }[]): { id: string; label: string; seats?: number; busy: boolean }[] {
  return tables
    .filter((t) => !t.deleted && !/^rooms?$/i.test((t.section ?? "").trim()))
    .map((t) => ({ id: t.id, label: t.label, ...(t.seats ? { seats: t.seats } : {}), busy: t.status === "occupied" || t.status === "billed" }))
    .sort((a, b) => Number(a.busy) - Number(b.busy) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** The two shareable QR links: in-house hotel guests (room picker only) and the public QR (book, dine in, takeaway, delivery). */
export function entryQrUrls(origin: string, slug: string): { inhouse: string; public: string } {
  return { inhouse: `${orderPageUrl(origin, slug, undefined, "stay")}&for=stay`, public: orderPageUrl(origin, slug, undefined, "public") };
}

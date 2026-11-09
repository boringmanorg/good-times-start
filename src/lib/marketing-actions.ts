import { supabase } from "@/integrations/supabase/client";
import { getDb, markDirty } from "./db";
import { normalisePhone } from "./customer-logic";
import { sanitizeBranding, cleanSource, type Branding, type ScanRow } from "./marketing-logic";
import type { Customer } from "./types";
import { isTestBrowser } from "./test-browser";

/* Branding, consent, scans and campaigns. The cloud is the shared copy; this device keeps the last
   copy it saw (marketing works offline) and queues brand, settings and campaign changes made offline,
   uploading them in order when the internet returns. A guest's consent lives on their guest record. */

export interface MarketingSettings {
  /** Automatic sending through the WhatsApp Business Platform. */
  auto?: boolean;
  /** Approved marketing template used for automatic campaigns. */
  template?: string;
  language?: string;
  /** Approved utility template for "your order is ready": {{1}} name, {{2}} order code. */
  readyTemplate?: string;
  /** Days before the same guest can get another campaign. */
  cooldownDays?: number;
}

const db = () => supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface MarketingOutlet { name: string; slug: string | null; ordering: Record<string, unknown> }
export interface MarketingSnapshot { branding: Branding; marketing: MarketingSettings; outlet: MarketingOutlet | null; savedAt: number; offline: boolean }

const snapKey = (restaurantId: string) => `marketing:snap:${restaurantId}`;
async function readMeta<T>(key: string): Promise<T | null> {
  try { const v = (await getDb().meta.get(key))?.value; return typeof v === "string" ? (JSON.parse(v) as T) : null; } catch { return null; }
}
async function writeMeta(key: string, value: unknown): Promise<void> {
  try { await getDb().meta.put({ key, value: JSON.stringify(value) }); } catch { /* storage unavailable */ }
}

/** True when a cloud call failed because there's no connection (not because it was refused). */
export function isNetworkError(error: { message?: string; status?: number; code?: string } | null | undefined): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error) return false;
  return error.status === 0 || /failed to fetch|networkerror|load failed|fetch failed|network request failed|timed? ?out/i.test(error.message ?? "");
}
const offlineNow = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Brand, WhatsApp settings and outlet details: from the cloud when online, else the copy last saved here. */
export async function loadBrandingAndMarketing(restaurantId: string): Promise<MarketingSnapshot> {
  const cached = await readMeta<Omit<MarketingSnapshot, "offline">>(snapKey(restaurantId));
  let fresh: Omit<MarketingSnapshot, "offline"> | null = null;
  if (!offlineNow()) {
    const { data, error } = await db().from("restaurants").select("branding, marketing, name, slug, ordering").eq("id", restaurantId).maybeSingle();
    if (error && !isNetworkError(error)) throw new Error("Couldn't load branding. Try again.");
    if (!error) {
      const row = (data ?? {}) as { branding?: Branding; marketing?: MarketingSettings; name?: string; slug?: string | null; ordering?: Record<string, unknown> };
      fresh = { branding: row.branding ?? {}, marketing: row.marketing ?? {}, outlet: { name: row.name ?? "", slug: row.slug ?? null, ordering: row.ordering ?? {} }, savedAt: Date.now() };
      await writeMeta(snapKey(restaurantId), fresh);
    }
  }
  const base = fresh ?? cached;
  if (!base) throw new Error("Marketing hasn't been opened on this device with the internet yet. Connect once to load it; after that it works offline.");
  // Changes still waiting to upload show as saved.
  const queued = (await readOutbox()).filter((op) => op.restaurantId === restaurantId);
  const branding = [...queued].reverse().find((op) => op.kind === "branding") as Extract<MarketingOp, { kind: "branding" }> | undefined;
  const settings = [...queued].reverse().find((op) => op.kind === "settings") as Extract<MarketingOp, { kind: "settings" }> | undefined;
  return { ...base, branding: branding?.branding ?? base.branding, marketing: settings?.settings ?? base.marketing, offline: !fresh };
}

/* ----------------------------------------------------- offline outbox */

export type MarketingOp =
  | { key: string; restaurantId: string; at: number; kind: "branding"; branding: Branding }
  | { key: string; restaurantId: string; at: number; kind: "settings"; settings: MarketingSettings }
  | { key: string; restaurantId: string; at: number; kind: "campaign"; row: Record<string, unknown> }
  | { key: string; restaurantId: string; at: number; kind: "send"; row: Record<string, unknown> };
type NewOp = MarketingOp extends infer O ? O extends MarketingOp ? Omit<O, "key" | "at"> : never : never;

const OUTBOX = "marketing:outbox";
const outboxListeners = new Set<() => void>();
export function subscribeMarketingOutbox(l: () => void) { outboxListeners.add(l); return () => { outboxListeners.delete(l); }; }
export async function readOutbox(): Promise<MarketingOp[]> { return (await readMeta<MarketingOp[]>(OUTBOX)) ?? []; }
async function writeOutbox(ops: MarketingOp[]) { await writeMeta(OUTBOX, ops); for (const l of outboxListeners) l(); }

/** Queue a change. A newer brand or settings change replaces an older one still waiting; sends replace the same guest's. */
export async function queueMarketingOp(op: NewOp): Promise<void> {
  const ops = await readOutbox();
  const key = op.kind === "branding" || op.kind === "settings" ? `${op.kind}:${op.restaurantId}`
    : op.kind === "campaign" ? `campaign:${String(op.row["id"])}` : `send:${String(op.row["campaign_id"])}:${String(op.row["phone"])}`;
  await writeOutbox([...ops.filter((o) => o.key !== key), { ...op, key, at: Date.now() } as MarketingOp]);
}

async function runOp(op: MarketingOp): Promise<{ error: { message?: string; status?: number; code?: string } | null }> {
  if (op.kind === "branding") return db().from("restaurants").update({ branding: op.branding }).eq("id", op.restaurantId).select("id");
  if (op.kind === "settings") return db().from("restaurants").update({ marketing: op.settings }).eq("id", op.restaurantId).select("id");
  if (op.kind === "campaign") return db().from("marketing_campaigns").upsert(op.row, { onConflict: "id" });
  return db().from("marketing_sends").upsert(op.row, { onConflict: "campaign_id,phone" });
}

let flushing: Promise<{ uploaded: number; refused: number }> | null = null;
/** Upload queued changes in order. Stops at the first connection problem; drops changes the cloud refuses. */
export function flushMarketingOutbox(): Promise<{ uploaded: number; refused: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let uploaded = 0, refused = 0;
    for (;;) {
      if (offlineNow()) break;
      const [op] = await readOutbox();
      if (!op) break;
      const { error } = await runOp(op);
      if (error && isNetworkError(error)) break;
      if (error) refused += 1; else uploaded += 1;
      await writeOutbox((await readOutbox()).filter((o) => !(o.key === op.key && o.at === op.at)));
      if (!error && (op.kind === "branding" || op.kind === "settings")) {
        const snap = await readMeta<Omit<MarketingSnapshot, "offline">>(snapKey(op.restaurantId));
        if (snap) await writeMeta(snapKey(op.restaurantId), op.kind === "branding" ? { ...snap, branding: op.branding } : { ...snap, marketing: op.settings });
      }
    }
    return { uploaded, refused };
  })().finally(() => { flushing = null; });
  return flushing;
}

function friendly(error: { code?: string; message?: string }): string {
  if (error.code === "23514") return "The pictures are too large. Try smaller ones.";
  if (error.code === "42501" || /row-level security/i.test(error.message ?? "")) return "Only the owner or a manager can change this.";
  if (/column .* does not exist|schema cache/i.test(error.message ?? "")) return "The database needs updating first (migration 0009).";
  return error.message ?? "Couldn't save. Try again.";
}

/** Save the brand. Offline it is kept on this device and uploads later; returns an error message or null. */
export async function saveBranding(restaurantId: string, branding: Branding): Promise<string | null> {
  const clean = sanitizeBranding(branding);
  if (offlineNow()) { await queueMarketingOp({ kind: "branding", restaurantId, branding: clean }); return null; }
  const { data, error } = await db().from("restaurants").update({ branding: clean }).eq("id", restaurantId).select("id");
  if (error && isNetworkError(error)) { await queueMarketingOp({ kind: "branding", restaurantId, branding: clean }); return null; }
  if (error) return friendly(error);
  if (!(data as unknown[] | null)?.length) return "Only the owner or a manager can change this.";
  const snap = await readMeta<Omit<MarketingSnapshot, "offline">>(snapKey(restaurantId));
  if (snap) await writeMeta(snapKey(restaurantId), { ...snap, branding: clean });
  return null;
}

export async function saveMarketingSettings(restaurantId: string, settings: MarketingSettings): Promise<string | null> {
  const clean: MarketingSettings = {
    auto: !!settings.auto,
    template: (settings.template ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 120),
    language: /^[a-z]{2,3}(_[A-Z]{2})?$/.test(settings.language ?? "") ? settings.language! : "en",
    readyTemplate: (settings.readyTemplate ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 120),
    cooldownDays: Math.min(30, Math.max(0, Math.round(Number(settings.cooldownDays ?? 3)))),
  };
  if (offlineNow()) { await queueMarketingOp({ kind: "settings", restaurantId, settings: clean }); return null; }
  const { data, error } = await db().from("restaurants").update({ marketing: clean }).eq("id", restaurantId).select("id");
  if (error && isNetworkError(error)) { await queueMarketingOp({ kind: "settings", restaurantId, settings: clean }); return null; }
  if (error) return friendly(error);
  if (!(data as unknown[] | null)?.length) return "Only the owner or a manager can change this.";
  const snap = await readMeta<Omit<MarketingSnapshot, "offline">>(snapKey(restaurantId));
  if (snap) await writeMeta(snapKey(restaurantId), { ...snap, marketing: clean });
  return null;
}

/**
 * Shrink a photo in the browser before saving it, so the guest page stays quick
 * on mobile data. Returns a WebP (or JPEG) data URL.
 */
export async function compressImage(file: File, maxWidth: number, maxHeight: number, quality = 0.78): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture file.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't open that picture."));
      el.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that picture.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL("image/webp", quality);
    if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
    // Step quality down until it fits comfortably.
    for (let q = quality - 0.12; out.length > 240_000 && q > 0.3; q -= 0.12) out = canvas.toDataURL(out.startsWith("data:image/webp") ? "image/webp" : "image/jpeg", q);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------- consent */

/** Record a guest's yes or no to WhatsApp offers on their guest record. */
export async function setWhatsappConsent(phone: string, optIn: boolean, source: string, name?: string): Promise<Customer | null> {
  const id = normalisePhone(phone);
  if (!id) return null;
  const d = getDb();
  const existing = await d.customers.get(id);
  if (existing?.whatsapp?.optIn === optIn && !(name && !existing.name)) return existing;
  const customer: Customer = {
    ...(existing ?? { id, phone: id, createdAt: Date.now() }),
    ...(name && !existing?.name ? { name } : {}),
    whatsapp: { ...(existing?.whatsapp ?? {}), optIn, at: Date.now(), source },
  };
  await d.customers.put(customer);
  await markDirty(["customer", id]);
  return customer;
}

/** Remember when guests were last messaged, so nobody gets campaigns too often. */
export async function markMessaged(customerIds: string[], at = Date.now()): Promise<void> {
  const d = getDb();
  const changed: string[] = [];
  await d.transaction("rw", d.customers, async () => {
    for (const id of customerIds) {
      const c = await d.customers.get(id);
      if (!c?.whatsapp) continue;
      await d.customers.put({ ...c, whatsapp: { ...c.whatsapp, lastMessagedAt: at } });
      changed.push(id);
    }
  });
  if (changed.length) await markDirty(...changed.map((id): ["customer", string] => ["customer", id]));
}

/* ---------------------------------------------------------- guest page */

/** Count a menu open, once per browser session per source. Never blocks the page. */
export async function logScan(slug: string, source: string): Promise<void> {
  if (isTestBrowser()) return;
  const clean = cleanSource(source) || "direct";
  const key = `xtsy-scan:${slug}:${clean}`;
  try { if (window.sessionStorage.getItem(key)) return; window.sessionStorage.setItem(key, "1"); } catch { /* private mode: count anyway */ }
  try { await db().rpc("log_qr_scan", { _slug: slug, _source: clean }); } catch { /* counting is best-effort */ }
}

export async function recordGuestChoice(id: string, token: string, optIn: boolean, source: string): Promise<void> {
  try { await db().rpc("guest_order_marketing", { _id: id, _token: token, _opt_in: optIn, _source: cleanSource(source) }); } catch { /* best-effort */ }
}

/* ------------------------------------------------------------- results */

export async function loadScans(restaurantId: string, days: number): Promise<{ scans: ScanRow[]; ordersBySource: Map<string, number>; optIns: number; savedAt: number; offline: boolean }> {
  const key = `marketing:scans:${restaurantId}:${days}`;
  try {
    const fresh = await loadScansFromCloud(restaurantId, days);
    await writeMeta(key, { scans: fresh.scans, ordersBySource: [...fresh.ordersBySource], optIns: fresh.optIns, savedAt: Date.now() });
    return { ...fresh, savedAt: Date.now(), offline: false };
  } catch (e) {
    const cached = await readMeta<{ scans: ScanRow[]; ordersBySource: [string, number][]; optIns: number; savedAt: number }>(key);
    if (!cached) throw e;
    return { scans: cached.scans, ordersBySource: new Map(cached.ordersBySource), optIns: cached.optIns, savedAt: cached.savedAt, offline: true };
  }
}

async function loadScansFromCloud(restaurantId: string, days: number): Promise<{ scans: ScanRow[]; ordersBySource: Map<string, number>; optIns: number }> {
  if (offlineNow()) throw new Error("Results need the internet; showing the last ones seen here.");
  const since = new Date(Date.now() - days * 86_400_000);
  const [scans, orders] = await Promise.all([
    db().from("qr_scans").select("day, source, scans").eq("restaurant_id", restaurantId).gte("day", since.toISOString().slice(0, 10)),
    db().from("guest_orders").select("source, table_id, whatsapp_opt_in, status").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).limit(5000),
  ]);
  if (scans.error) throw new Error(friendly(scans.error));
  const ordersBySource = new Map<string, number>();
  let optIns = 0;
  for (const o of (orders.data ?? []) as { source: string | null; table_id: string | null; whatsapp_opt_in: boolean; status: string }[]) {
    if (o.status === "rejected" || o.status === "cancelled") continue;
    const source = o.source || (o.table_id ? cleanSource(o.table_id) : "direct");
    ordersBySource.set(source, (ordersBySource.get(source) ?? 0) + 1);
    if (o.whatsapp_opt_in) optIns += 1;
  }
  return { scans: (scans.data ?? []) as ScanRow[], ordersBySource, optIns };
}

/* ----------------------------------------------------------- campaigns */

export interface Campaign {
  id: string; name: string; message: string; audience: string; mode: "manual" | "auto"; template: string;
  recipients: number; sent: number; failed: number; created_at: string;
}

export async function loadCampaigns(restaurantId: string): Promise<Campaign[]> {
  const key = `marketing:campaigns:${restaurantId}`;
  const queued = (await readOutbox()).filter((op): op is Extract<MarketingOp, { kind: "campaign" }> => op.kind === "campaign" && op.restaurantId === restaurantId)
    .map((op) => ({ sent: 0, failed: 0, created_at: new Date(op.at).toISOString(), ...op.row }) as unknown as Campaign);
  let list: Campaign[] | null = null;
  if (!offlineNow()) {
    const { data, error } = await db().from("marketing_campaigns").select("id, name, message, audience, mode, template, recipients, sent, failed, created_at")
      .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(50);
    if (error && !isNetworkError(error)) throw new Error(friendly(error));
    if (!error) { list = (data ?? []) as Campaign[]; await writeMeta(key, list); }
  }
  list ??= (await readMeta<Campaign[]>(key)) ?? [];
  return [...queued.filter((q) => !list.some((c) => c.id === q.id)), ...list];
}

/** Start a campaign. Works offline: the record uploads when the internet returns. */
export async function createCampaign(restaurantId: string, c: { name: string; message: string; audience: string; mode: "manual" | "auto"; template?: string; recipients: number }): Promise<string> {
  if (c.mode === "auto" && offlineNow()) throw new Error("Automatic sending needs the internet. Use manual sending, or try again when online.");
  const row = {
    id: crypto.randomUUID(), restaurant_id: restaurantId, name: c.name.trim().slice(0, 80) || "Campaign", message: c.message.slice(0, 1000),
    audience: c.audience, mode: c.mode, template: c.template ?? "", recipients: c.recipients,
  };
  if (offlineNow()) { await queueMarketingOp({ kind: "campaign", restaurantId, row }); return row.id; }
  const { error } = await db().from("marketing_campaigns").insert(row);
  if (error && isNetworkError(error) && c.mode === "manual") { await queueMarketingOp({ kind: "campaign", restaurantId, row }); return row.id; }
  if (error) throw new Error(friendly(error));
  return row.id;
}

/** Note that a guest was sent (or skipped). Offline it waits on this device. */
export async function recordSend(restaurantId: string, campaignId: string, wa: string, name: string, status: "sent" | "skipped"): Promise<void> {
  const row = { campaign_id: campaignId, restaurant_id: restaurantId, phone: wa, name, status, at: new Date().toISOString() };
  // A campaign still waiting to upload must reach the cloud before its sends.
  const waiting = (await readOutbox()).some((op) => op.kind === "campaign" && op.row["id"] === campaignId);
  if (offlineNow() || waiting) { await queueMarketingOp({ kind: "send", restaurantId, row }); return; }
  const { error } = await db().from("marketing_sends").upsert(row, { onConflict: "campaign_id,phone" });
  if (error && isNetworkError(error)) await queueMarketingOp({ kind: "send", restaurantId, row });
}

export async function loadSentPhones(campaignId: string): Promise<Set<string>> {
  const queued = (await readOutbox()).filter((op) => op.kind === "send" && op.row["campaign_id"] === campaignId).map((op) => String((op as Extract<MarketingOp, { kind: "send" }>).row["phone"]));
  if (offlineNow()) return new Set(queued);
  const { data } = await db().from("marketing_sends").select("phone, status").eq("campaign_id", campaignId);
  return new Set([...((data ?? []) as { phone: string; status: string }[]).filter((r) => r.status !== "failed").map((r) => r.phone), ...queued]);
}

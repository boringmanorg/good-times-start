/**
 * Server only. The integration sandbox's loads and saves (service role). Every entry point is
 * called only after its caller is checked: the console's super admin (sandbox.functions.ts) or a
 * partner's test key (the /api/sandbox/v1 route). Everything happens on a TEST property only:
 * an account with the `sandbox` feature override, set by XTSY at onboarding. A real property is
 * refused, whoever asks.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { localDate } from "@/lib/pms/dates";
import type { Stay, Unit, UnitType } from "@/lib/pms/types";
import {
  ariFor,
  buildPartnerStay,
  cancelPartnerStay,
  changePartnerStay,
  channelName,
  isPartnerKeyShape,
  keyPrefix,
  newPartnerKey,
  newWebhookSecret,
  publicStay,
  sampleRooms,
  sha256Hex,
  signWebhook,
  stayForChannel,
  webhookUrlProblem,
  type ChangeRequest,
  type PartnerBooking,
} from "./core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
const db = () => supabaseAdmin as unknown as Loose;

export class SandboxError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** True only for a property whose account XTSY marked as a sandbox test property. */
export async function isSandboxProperty(restaurantId: string): Promise<boolean> {
  const { data } = await db()
    .from("restaurants")
    .select("account_id, accounts(feature_overrides)")
    .eq("id", restaurantId)
    .maybeSingle();
  const overrides = (data as { accounts?: { feature_overrides?: Record<string, unknown> } } | null)
    ?.accounts?.feature_overrides;
  return overrides?.["sandbox"] === true && overrides?.["pms"] === true;
}

async function mustBeSandbox(restaurantId: string) {
  if (!(await isSandboxProperty(restaurantId)))
    throw new SandboxError(
      "This is not a sandbox test property. The sandbox never touches a real property.",
      403,
    );
}

interface Loaded {
  types: UnitType[];
  units: Unit[];
  stays: Stay[];
  name: string;
}

async function load(restaurantId: string): Promise<Loaded> {
  const [{ data: rows, error }, { data: rest }] = await Promise.all([
    db()
      .from("restaurant_records")
      .select("kind, record_id, payload, deleted")
      .eq("restaurant_id", restaurantId)
      .in("kind", ["unit_type", "unit", "stay"]),
    db().from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
  ]);
  if (error) throw new SandboxError("Couldn't read the property just now.", 503);
  const live = ((rows ?? []) as { kind: string; payload: unknown; deleted: boolean }[]).filter(
    (r) => !r.deleted,
  );
  return {
    types: live
      .filter((r) => r.kind === "unit_type")
      .map((r) => r.payload as UnitType)
      .filter((t) => !t.archived),
    units: live
      .filter((r) => r.kind === "unit")
      .map((r) => r.payload as Unit)
      .filter((u) => !u.archived),
    stays: live.filter((r) => r.kind === "stay").map((r) => r.payload as Stay),
    name: (rest as { name?: string } | null)?.name ?? "Test property",
  };
}

async function saveRecords(
  restaurantId: string,
  rows: { kind: "unit_type" | "unit" | "stay"; id: string; payload: unknown }[],
) {
  if (!rows.length) return;
  const { error } = await db()
    .from("restaurant_records")
    .upsert(
      rows.map((r) => ({
        restaurant_id: restaurantId,
        kind: r.kind,
        record_id: r.id,
        payload: r.payload,
        deleted: false,
      })),
      { onConflict: "restaurant_id,kind,record_id" },
    );
  if (error) throw new SandboxError(`The property refused the change: ${error.message}`, 409);
}

export async function logEvent(
  restaurantId: string,
  source: string,
  kind: string,
  detail: Record<string, unknown>,
) {
  await db()
    .from("sandbox_events")
    .insert({
      restaurant_id: restaurantId,
      source: source.slice(0, 80),
      kind: kind.slice(0, 60),
      detail,
    });
}

/* ------------------------------ Property, ARI, bookings ------------------------------ */

export async function propertyInfo(restaurantId: string) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  return {
    name: p.name,
    sandbox: true,
    roomTypes: p.types
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        name: t.name,
        soldAs: t.soldAs,
        maxGuests: t.maxGuests,
        femaleOnly: t.femaleOnly,
        units: p.units.filter((u) => u.typeId === t.id).length,
        baseRate: t.rate,
        plans: (t.plans?.filter((x) => x.active).length
          ? t.plans.filter((x) => x.active)
          : [{ id: "standard", name: "Room only", meal: "room_only", refundable: true }]
        ).map((x) => ({ id: x.id, name: x.name, meal: x.meal, refundable: x.refundable })),
      })),
  };
}

export async function ari(restaurantId: string, from: string, days: number) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  return { from, days, roomTypes: ariFor(p.types, p.units, p.stays, from, days) };
}

export async function listBookings(restaurantId: string, from?: string, to?: string) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  return p.stays
    .filter((s) => s.sandbox)
    .filter((s) => (!from || s.checkOut > from) && (!to || s.checkIn < to))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200)
    .map((s) => publicStay(s, p.types));
}

function findStay(stays: Stay[], idOrRef: string): Stay | undefined {
  return stays.find((s) => s.sandbox && (s.id === idOrRef || s.reference === idOrRef));
}

export async function createBooking(
  restaurantId: string,
  b: PartnerBooking,
  by: string,
  source: string,
) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  const existing = stayForChannel(p.stays, b.channel, b.channelBookingId);
  if (existing) {
    await logEvent(restaurantId, source, "booking.duplicate", {
      reference: existing.reference,
      channel: channelName(b.channel),
      channelBookingId: b.channelBookingId,
    });
    return { created: false, booking: publicStay(existing, p.types) };
  }
  const made = buildPartnerStay(b, {
    types: p.types,
    units: p.units,
    stays: p.stays,
    today: localDate(),
    now: Date.now(),
    id: crypto.randomUUID(),
    by,
  });
  if ("error" in made) {
    await logEvent(restaurantId, source, "booking.refused", {
      channel: channelName(b.channel),
      channelBookingId: b.channelBookingId,
      why: made.error,
    });
    throw new SandboxError(made.error, 409);
  }
  await saveRecords(restaurantId, [{ kind: "stay", id: made.stay.id, payload: made.stay }]);
  const booking = publicStay(made.stay, p.types);
  await logEvent(restaurantId, source, "booking.created", {
    reference: booking.reference,
    channel: booking.channel,
    channelBookingId: b.channelBookingId,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
  });
  await deliver(restaurantId, "booking.created", booking);
  return { created: true, booking };
}

export async function changeBooking(
  restaurantId: string,
  idOrRef: string,
  c: ChangeRequest,
  by: string,
  source: string,
) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  const stay = findStay(p.stays, idOrRef);
  if (!stay) throw new SandboxError("No sandbox booking with that id or reference.", 404);
  const next = changePartnerStay(stay, c, {
    types: p.types,
    units: p.units,
    stays: p.stays,
    today: localDate(),
    now: Date.now(),
    by,
  });
  if ("error" in next) {
    await logEvent(restaurantId, source, "booking.change_refused", {
      reference: stay.reference,
      why: next.error,
    });
    throw new SandboxError(next.error, 409);
  }
  await saveRecords(restaurantId, [{ kind: "stay", id: next.stay.id, payload: next.stay }]);
  const booking = publicStay(next.stay, p.types);
  await logEvent(restaurantId, source, "booking.modified", {
    reference: booking.reference,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
  });
  await deliver(restaurantId, "booking.modified", booking);
  return booking;
}

export async function cancelBooking(
  restaurantId: string,
  idOrRef: string,
  reason: string,
  by: string,
  source: string,
) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  const stay = findStay(p.stays, idOrRef);
  if (!stay) throw new SandboxError("No sandbox booking with that id or reference.", 404);
  const was = stay.status;
  const next = cancelPartnerStay(stay, reason, { now: Date.now(), by });
  if ("error" in next) throw new SandboxError(next.error, 409);
  if (was === "cancelled") return publicStay(stay, p.types);
  await saveRecords(restaurantId, [{ kind: "stay", id: next.stay.id, payload: next.stay }]);
  const booking = publicStay(next.stay, p.types);
  await logEvent(restaurantId, source, "booking.cancelled", {
    reference: booking.reference,
    reason: reason.slice(0, 120),
  });
  await deliver(restaurantId, "booking.cancelled", booking);
  return booking;
}

/** Two dorms and a private room, for an empty test property. Refused once it has rooms. */
export async function loadSampleRooms(restaurantId: string) {
  await mustBeSandbox(restaurantId);
  const p = await load(restaurantId);
  if (p.types.length) throw new SandboxError("This test property already has room types.", 409);
  const s = sampleRooms(() => crypto.randomUUID());
  await saveRecords(restaurantId, [
    ...s.types.map((t) => ({ kind: "unit_type" as const, id: t.id, payload: t })),
    ...s.units.map((u) => ({ kind: "unit" as const, id: u.id, payload: u })),
  ]);
  await logEvent(restaurantId, "console", "property.sample_rooms", {
    types: s.types.length,
    units: s.units.length,
  });
  return { types: s.types.length, units: s.units.length };
}

/* ---------------------------------- Partner keys ---------------------------------- */

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  webhookUrl: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listKeys(restaurantId: string): Promise<KeyRow[]> {
  const { data } = await db()
    .from("sandbox_partner_keys")
    .select("id, name, key_prefix, webhook_url, created_at, last_used_at, revoked_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, string | null>[]).map((r) => ({
    id: r["id"]!,
    name: r["name"]!,
    prefix: r["key_prefix"]!,
    webhookUrl: r["webhook_url"] ?? null,
    createdAt: r["created_at"]!,
    lastUsedAt: r["last_used_at"] ?? null,
    revokedAt: r["revoked_at"] ?? null,
  }));
}

/** Makes a key; the key and the webhook secret are returned ONCE and never again. */
export async function createKey(
  restaurantId: string,
  name: string,
  webhookUrl: string | null,
  by: string,
) {
  await mustBeSandbox(restaurantId);
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2)
    throw new SandboxError('Name the key after the partner (e.g. "Acme channel manager").');
  if (webhookUrl) {
    const problem = webhookUrlProblem(webhookUrl);
    if (problem) throw new SandboxError(problem);
  }
  const { count } = await db()
    .from("sandbox_partner_keys")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .is("revoked_at", null);
  if ((count ?? 0) >= 10)
    throw new SandboxError("Ten keys are active on this test property. Revoke one first.");
  const key = newPartnerKey();
  const secret = newWebhookSecret();
  const { error } = await db()
    .from("sandbox_partner_keys")
    .insert({
      restaurant_id: restaurantId,
      name: clean,
      key_prefix: keyPrefix(key),
      key_hash: await sha256Hex(key),
      webhook_url: webhookUrl,
      webhook_secret: secret,
      created_by: by,
    });
  if (error) throw new SandboxError(`Couldn't save the key: ${error.message}`, 500);
  await logEvent(restaurantId, "console", "key.created", {
    name: clean,
    prefix: keyPrefix(key),
    webhook: !!webhookUrl,
  });
  return { key, webhookSecret: secret };
}

export async function revokeKey(restaurantId: string, keyId: string) {
  const { error } = await db()
    .from("sandbox_partner_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("restaurant_id", restaurantId)
    .is("revoked_at", null);
  if (error) throw new SandboxError(error.message, 500);
  await logEvent(restaurantId, "console", "key.revoked", { id: keyId });
}

/** The property and key behind a bearer token, or null. Refuses revoked keys and real properties. */
export async function keyFromBearer(
  header: string | null,
): Promise<{ restaurantId: string; keyId: string; name: string } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1] ?? "";
  if (!isPartnerKeyShape(token)) return null;
  const { data } = await db()
    .from("sandbox_partner_keys")
    .select("id, restaurant_id, name, revoked_at")
    .eq("key_hash", await sha256Hex(token))
    .maybeSingle();
  const row = data as {
    id: string;
    restaurant_id: string;
    name: string;
    revoked_at: string | null;
  } | null;
  if (!row || row.revoked_at) return null;
  if (!(await isSandboxProperty(row.restaurant_id))) return null;
  await db()
    .from("sandbox_partner_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);
  return { restaurantId: row.restaurant_id, keyId: row.id, name: row.name };
}

/* ------------------------------------ Webhooks ------------------------------------ */

/**
 * Sends an event to every active key's webhook, once, signed with that key's secret
 * (X-XTSY-Signature). No retries of our own: a failure is logged and shown in the console.
 */
export async function deliver(
  restaurantId: string,
  event: string,
  data: unknown,
  onlyKeyId?: string,
) {
  const { data: rows } = await db()
    .from("sandbox_partner_keys")
    .select("id, name, webhook_url, webhook_secret")
    .eq("restaurant_id", restaurantId)
    .is("revoked_at", null)
    .not("webhook_url", "is", null);
  const targets = (
    (rows ?? []) as { id: string; name: string; webhook_url: string; webhook_secret: string }[]
  ).filter((r) => !onlyKeyId || r.id === onlyKeyId);
  await Promise.all(
    targets.map(async (t) => {
      if (webhookUrlProblem(t.webhook_url)) return;
      const body = JSON.stringify({
        id: crypto.randomUUID(),
        event,
        sandbox: true,
        createdAt: new Date().toISOString(),
        data,
      });
      const ts = Math.floor(Date.now() / 1000);
      let status = 0;
      let note = "";
      try {
        const res = await fetch(t.webhook_url, {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
          headers: {
            "content-type": "application/json",
            "user-agent": "XTSY-Sandbox/1",
            "x-xtsy-event": event,
            "x-xtsy-signature": await signWebhook(t.webhook_secret, ts, body),
          },
          body,
        });
        status = res.status;
      } catch (e) {
        note = e instanceof Error ? e.name : "failed";
      }
      await logEvent(
        restaurantId,
        `webhook:${t.name}`,
        status >= 200 && status < 300 ? "webhook.delivered" : "webhook.failed",
        { event, status, ...(note ? { note } : {}), host: new URL(t.webhook_url).hostname },
      );
    }),
  );
}

export async function recentEvents(restaurantId: string, limit = 60) {
  const { data } = await db()
    .from("sandbox_events")
    .select("id, at, source, kind, detail")
    .eq("restaurant_id", restaurantId)
    .order("at", { ascending: false })
    .limit(Math.min(200, limit));
  // Flattened to "key: value" text so it travels to the console as plain strings.
  return (
    (data ?? []) as {
      id: number;
      at: string;
      source: string;
      kind: string;
      detail: Record<string, unknown> | null;
    }[]
  ).map((e) => ({
    id: e.id,
    at: e.at,
    source: e.source,
    kind: e.kind,
    detail: Object.entries(e.detail ?? {})
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" · "),
  }));
}

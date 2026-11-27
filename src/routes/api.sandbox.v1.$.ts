import { createFileRoute } from "@tanstack/react-router";

/**
 * XTSY sandbox partner API, v1 (test properties only). Auth: `Authorization: Bearer xsb_test_…`
 * from Console → stay property → Sandbox. Docs on the same console screen.
 *
 *   GET    /api/sandbox/v1/property
 *   GET    /api/sandbox/v1/ari?from=YYYY-MM-DD&days=14         (days ≤ 90)
 *   GET    /api/sandbox/v1/bookings?from=&to=
 *   POST   /api/sandbox/v1/bookings                            (idempotent on channel + channelBookingId)
 *   GET    /api/sandbox/v1/bookings/:idOrReference
 *   PATCH  /api/sandbox/v1/bookings/:idOrReference             { checkIn?, checkOut?, guest? }
 *   POST   /api/sandbox/v1/bookings/:idOrReference/cancel      { reason }
 */
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const fail = (status: number, error: string) => json(status, { error });
const MAX_BODY = 32_000;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error("Body too large."), { status: 413 });
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error("Body isn't valid JSON."), { status: 400 });
  }
}

async function handle(request: Request, splat: string): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  const s = await import("@/lib/sandbox/sandbox.server");
  const core = await import("@/lib/sandbox/core");
  const key = await s.keyFromBearer(request.headers.get("authorization"));
  if (!key) return fail(401, "Send a valid test key: Authorization: Bearer xsb_test_…");
  const by = `partner:${key.name}`;
  const source = `api:${key.name}`;
  const parts = splat.split("/").filter(Boolean).map(decodeURIComponent);
  const url = new URL(request.url);
  try {
    if (parts[0] === "property" && parts.length === 1 && request.method === "GET")
      return json(200, await s.propertyInfo(key.restaurantId));
    if (parts[0] === "ari" && parts.length === 1 && request.method === "GET") {
      const from = url.searchParams.get("from") ?? "";
      const days = Number(url.searchParams.get("days") ?? "14");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return fail(400, "from is a date like 2026-12-24.");
      if (!Number.isInteger(days) || days < 1 || days > core.MAX_ARI_DAYS)
        return fail(400, `days is 1 to ${core.MAX_ARI_DAYS}.`);
      return json(200, await s.ari(key.restaurantId, from, days));
    }
    if (parts[0] === "bookings") {
      if (parts.length === 1 && request.method === "GET")
        return json(200, {
          bookings: await s.listBookings(
            key.restaurantId,
            url.searchParams.get("from") ?? undefined,
            url.searchParams.get("to") ?? undefined,
          ),
        });
      if (parts.length === 1 && request.method === "POST") {
        const parsed = core.parsePartnerBooking(await readJson(request));
        if (!parsed.ok) return fail(400, parsed.error);
        const r = await s.createBooking(key.restaurantId, parsed.value, by, source);
        return json(r.created ? 201 : 200, r);
      }
      const id = parts[1] ?? "";
      if (parts.length === 2 && request.method === "GET") {
        const found = (await s.listBookings(key.restaurantId)).find(
          (b) => b.id === id || b.reference === id,
        );
        return found
          ? json(200, found)
          : fail(404, "No sandbox booking with that id or reference.");
      }
      if (parts.length === 2 && request.method === "PATCH") {
        const parsed = core.parseChange(await readJson(request));
        if (!parsed.ok) return fail(400, parsed.error);
        return json(200, await s.changeBooking(key.restaurantId, id, parsed.value, by, source));
      }
      if (parts.length === 3 && parts[2] === "cancel" && request.method === "POST") {
        const body = (await readJson(request)) as { reason?: unknown };
        return json(
          200,
          await s.cancelBooking(
            key.restaurantId,
            id,
            typeof body.reason === "string" ? body.reason : "",
            by,
            source,
          ),
        );
      }
    }
    return fail(404, "Unknown endpoint. See Console → Sandbox for the list.");
  } catch (e) {
    const status =
      e instanceof s.SandboxError ? e.status : ((e as { status?: number }).status ?? 500);
    return fail(
      status,
      status === 500 ? "Something went wrong on our side." : (e as Error).message,
    );
  }
}

export const Route = createFileRoute("/api/sandbox/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params._splat ?? ""),
      POST: ({ request, params }) => handle(request, params._splat ?? ""),
      PATCH: ({ request, params }) => handle(request, params._splat ?? ""),
      OPTIONS: ({ request, params }) => handle(request, params._splat ?? ""),
    },
  },
});

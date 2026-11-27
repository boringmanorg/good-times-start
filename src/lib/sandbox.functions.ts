import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* Super admin: the integration sandbox on a TEST property (Console → stay property → Sandbox).
   Server code loads inside each handler so the service role never reaches the browser. */

const token = z.string().min(20).max(4096);
const restaurantId = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function guard(t: string): Promise<string> {
  const { superAdminFromToken } = await import("./platform/logins.server");
  return superAdminFromToken(t);
}

async function run<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export const sandboxOverview = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, restaurantId, from: date }).parse(input))
  .handler(async ({ data }) => {
    await guard(data.token);
    const s = await import("./sandbox/sandbox.server");
    const sandbox = await s.isSandboxProperty(data.restaurantId);
    if (!sandbox) return { sandbox: false as const };
    const [property, ari, bookings, keys, events] = await Promise.all([
      s.propertyInfo(data.restaurantId),
      s.ari(data.restaurantId, data.from, 14),
      s.listBookings(data.restaurantId),
      s.listKeys(data.restaurantId),
      s.recentEvents(data.restaurantId),
    ]);
    return { sandbox: true as const, property, ari, bookings, keys, events };
  });

export const sandboxLoadSample = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, restaurantId }).parse(input))
  .handler(async ({ data }) => {
    await guard(data.token);
    const s = await import("./sandbox/sandbox.server");
    return run(() => s.loadSampleRooms(data.restaurantId));
  });

export const sandboxSimulate = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, restaurantId, booking: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    await guard(data.token);
    const { parsePartnerBooking, channelName } = await import("./sandbox/core");
    const s = await import("./sandbox/sandbox.server");
    const parsed = parsePartnerBooking(data.booking);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const who = `sandbox:${channelName(parsed.value.channel)}`;
    return run(() =>
      s.createBooking(
        data.restaurantId,
        parsed.value,
        who,
        `simulator:${channelName(parsed.value.channel)}`,
      ),
    );
  });

export const sandboxChange = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ token, restaurantId, booking: z.string().max(80), change: z.unknown() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await guard(data.token);
    const { parseChange } = await import("./sandbox/core");
    const s = await import("./sandbox/sandbox.server");
    const parsed = parseChange(data.change);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    return run(() =>
      s.changeBooking(
        data.restaurantId,
        data.booking,
        parsed.value,
        "sandbox:simulator",
        "simulator",
      ),
    );
  });

export const sandboxCancel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ token, restaurantId, booking: z.string().max(80), reason: z.string().max(200) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await guard(data.token);
    const s = await import("./sandbox/sandbox.server");
    return run(() =>
      s.cancelBooking(
        data.restaurantId,
        data.booking,
        data.reason,
        "sandbox:simulator",
        "simulator",
      ),
    );
  });

export const sandboxCreateKey = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token,
        restaurantId,
        name: z.string().max(60),
        webhookUrl: z.string().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const by = await guard(data.token);
    const s = await import("./sandbox/sandbox.server");
    return run(() =>
      s.createKey(data.restaurantId, data.name, data.webhookUrl?.trim() || null, by),
    );
  });

export const sandboxRevokeKey = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token, restaurantId, keyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await guard(data.token);
    const s = await import("./sandbox/sandbox.server");
    return run(() => s.revokeKey(data.restaurantId, data.keyId));
  });

export const sandboxTestWebhook = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token, restaurantId, keyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await guard(data.token);
    const s = await import("./sandbox/sandbox.server");
    return run(() =>
      s.deliver(
        data.restaurantId,
        "test",
        { message: "Test webhook from the XTSY sandbox." },
        data.keyId,
      ),
    );
  });

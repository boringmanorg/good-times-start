import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* The three internal logins. Server code is loaded inside each handler so the
   service role and crypto never reach the browser bundle. */

const loginId = z.enum(["admin", "billdesk", "waiter"]);

/** Creates any missing login (already confirmed) and links all three to the restaurant. Never changes a password. */
export const ensureInternalLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context;
    const { data } = await ctx.supabase.from("restaurant_members").select("role").eq("user_id", ctx.userId).in("role", ["owner", "manager"]).limit(1);
    if (!data || data.length === 0) throw new Error("Only the admin can set up logins.");
    const { ensureLogins } = await import("./staff-logins/logins.server");
    return ensureLogins(ctx.userId);
  });

/** Admin sets a new password for a login. */
export const resetLoginPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ login: loginId, password: z.string().min(8).max(72) }).parse(input))
  .handler(async () => {
    // Exclusive control (13 Nov 2026): passwords are set and reset only by XTSY in the super
    // admin console. The restaurant-side path stays refused even if an old build calls it.
    throw new Error("Passwords are managed by XTSY. Ask the admin to contact XTSY support.");
  });

/** Send a 6-digit code to the login's WhatsApp number. */
export const requestResetCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ login: loginId }).parse(input))
  .handler(async () => {
    throw new Error("Password resets are handled by XTSY. Ask the admin to contact XTSY support.");
  });

/** Check the code and set the new password. */
export const confirmResetCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ login: loginId, code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(72) }).parse(input))
  .handler(async () => {
    throw new Error("Password resets are handled by XTSY. Ask the admin to contact XTSY support.");
  });

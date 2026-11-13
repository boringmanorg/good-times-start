import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Super admin: restaurant logins. Server code loads inside each handler so the service role
   never reaches the browser; each handler checks the caller is a super admin first. */

const roles = z.enum(["owner", "manager", "cashier", "captain", "kitchen"]);

export const createPlatformLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    restaurantId: z.string().uuid(), email: z.string().min(3).max(120), password: z.string().min(8).max(72), role: roles, displayName: z.string().max(60),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, createLogin } = await import("./platform/logins.server");
    await assertSuperAdmin(context.supabase);
    return createLogin(context.userId, data);
  });

export const updatePlatformLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    restaurantId: z.string().uuid(), userId: z.string().uuid(),
    email: z.string().min(3).max(120).optional(), displayName: z.string().max(60).optional(), role: roles.optional(),
    password: z.string().min(8).max(72).optional(), signIn: z.boolean().optional(), remove: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, updateLogin } = await import("./platform/logins.server");
    await assertSuperAdmin(context.supabase);
    return updateLogin(context.userId, data);
  });

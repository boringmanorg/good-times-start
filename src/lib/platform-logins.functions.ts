import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* Super admin: restaurant logins. Server code loads inside each handler so the service role
   never reaches the browser. The console sends its own session token (it keeps a sign-in
   separate from the staff apps); each handler checks that token belongs to a super admin. */

const roles = z.enum(["owner", "manager", "cashier", "captain", "kitchen"]);
const token = z.string().min(20).max(4096);

export const createPlatformLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    token, restaurantId: z.string().uuid(), email: z.string().min(3).max(120), password: z.string().min(8).max(72), role: roles, displayName: z.string().max(60),
  }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken, createLogin } = await import("./platform/logins.server");
    const by = await superAdminFromToken(data.token);
    const { token: _t, ...input } = data;
    return createLogin(by, input);
  });

export const updatePlatformLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    token, restaurantId: z.string().uuid(), userId: z.string().uuid(),
    email: z.string().min(3).max(120).optional(), displayName: z.string().max(60).optional(), role: roles.optional(),
    password: z.string().min(8).max(72).optional(), signIn: z.boolean().optional(), remove: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken, updateLogin } = await import("./platform/logins.server");
    const by = await superAdminFromToken(data.token);
    const { token: _t, ...input } = data;
    return updateLogin(by, input);
  });

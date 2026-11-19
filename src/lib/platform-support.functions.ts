import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* Super admin: "Sign in as" a restaurant login, and the history of it. See support-logic.ts. */

const token = z.string().min(20).max(4096);

export const platformSupportSignIn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, restaurantId: z.string().uuid(), userId: z.string().uuid(), reason: z.string().max(400) }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken, superAdminEmail } = await import("./platform/logins.server");
    const { supportSignIn } = await import("./platform/support.server");
    const by = await superAdminFromToken(data.token);
    return supportSignIn(by, await superAdminEmail(by), { restaurantId: data.restaurantId, userId: data.userId, reason: data.reason });
  });

export const platformSupportHistory = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken } = await import("./platform/logins.server");
    const { supportHistory } = await import("./platform/support.server");
    await superAdminFromToken(data.token);
    return supportHistory(data.restaurantId);
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* Super admin: onboarding a new outlet. Server code loads inside each handler so the
   service role never reaches the browser. Callers send the console session token;
   each handler checks it belongs to a super admin. */

const token = z.string().min(20).max(4096);

export const onboardPlatformRestaurant = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    token,
    name: z.string().min(2).max(60),
    model: z.string().min(2).max(20),
    slug: z.string().max(40),
    city: z.string().max(80),
    plan: z.string().min(2).max(20),
    billingPhone: z.string().max(20),
    billingEmail: z.string().max(120),
    ownerEmail: z.string().min(3).max(120),
    ownerName: z.string().max(60),
    ownerPassword: z.string().min(8).max(72),
  }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken } = await import("./platform/logins.server");
    const { onboardRestaurant } = await import("./platform/restaurants.server");
    const by = await superAdminFromToken(data.token);
    const { token: _t, ...input } = data;
    return onboardRestaurant(by, input);
  });

export const platformRestaurantModels = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken } = await import("./platform/logins.server");
    const { restaurantModels } = await import("./platform/restaurants.server");
    await superAdminFromToken(data.token);
    return restaurantModels();
  });

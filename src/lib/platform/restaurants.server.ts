/**
 * Server only. Super admin onboarding of a new outlet: account, restaurant and the
 * owner's login in one pass, with the service role. Every caller goes through
 * superAdminFromToken first (see platform-restaurants.functions.ts).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogin } from "./logins.server";
import { cleanEmail } from "@/lib/platform-login-logic";
import { isProductId, STAY_PRODUCTS, type ProductId } from "@/lib/products";
import { cleanSlug, isBusinessModel, nameProblem, planFitsProduct, slugProblem, type BusinessModel } from "@/lib/platform-restaurant-logic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin as unknown as { from: (t: string) => any };

export interface OnboardRestaurant {
  name: string;
  model: string;
  slug: string;
  city: string;
  plan: string;
  billingPhone: string;
  billingEmail: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  /** XTSY product (products.ts); none means Restaurant POS. */
  product?: string | undefined;
  /** A stay test property for the integration sandbox (never a real one). */
  sandbox?: boolean | undefined;
}

export interface Onboarded { restaurantId: string; accountId: string; ownerUserId: string; ownerEmail: string }

/**
 * The new outlet starts on a 14-day trial of the chosen plan; the first payment the
 * super admin records (Renewal and payment) makes it active. The business model is
 * kept in restaurants.branding.model.
 */
export async function onboardRestaurant(by: string, input: OnboardRestaurant): Promise<Onboarded> {
  const name = input.name.trim();
  const slug = cleanSlug(input.slug);
  const problem = nameProblem(name) ?? slugProblem(slug)
    ?? (isBusinessModel(input.model) ? null : "Choose the business model.")
    ?? (planFitsProduct(input.plan, input.product) ? null : "Choose a plan.")
    ?? (input.product === undefined || isProductId(input.product) ? null : "Choose the product.");
  if (problem) throw new Error(problem);
  const model = input.model as BusinessModel;
  const product: ProductId = isProductId(input.product) ? input.product : "restaurant_pos";
  const stays = STAY_PRODUCTS.includes(product);

  if (slug) {
    const { data: taken } = await admin().from("restaurants").select("id").eq("slug", slug).maybeSingle();
    if (taken) throw new Error("Another restaurant already uses that QR address.");
  }

  const { data: account, error: aErr } = await admin().from("accounts").insert({
    name,
    plan_id: input.plan,
    // Stay properties start on the complimentary pilot plan; restaurants on a 14-day trial.
    ...(stays ? { status: "active", complimentary: true } : { status: "trialing" }),
    billing_phone: input.billingPhone.trim().slice(0, 20),
    billing_email: cleanEmail(input.billingEmail).slice(0, 120),
    notes: "",
    // A stay property gets the front desk (PMS by XTSY); no plan carries it yet.
    ...(stays ? { feature_overrides: input.sandbox ? { pms: true, sandbox: true } : { pms: true } } : {}),
  }).select("id").single();
  if (aErr || !account) throw new Error(`Couldn't create the account: ${aErr?.message ?? "unknown error"}`);
  const accountId = (account as { id: string }).id;

  const { data: rest, error: rErr } = await admin().from("restaurants").insert({
    name,
    slug: slug || null,
    city: input.city.trim().slice(0, 80),
    account_id: accountId,
    branding: { model, product },
  }).select("id").single();
  if (rErr || !rest) {
    await admin().from("accounts").delete().eq("id", accountId);
    throw new Error(`Couldn't create the restaurant: ${rErr?.message ?? "unknown error"}`);
  }
  const restaurantId = (rest as { id: string }).id;

  let owner: { userId: string; email: string };
  try {
    owner = await createLogin(by, {
      restaurantId,
      email: input.ownerEmail,
      password: input.ownerPassword,
      role: "owner",
      displayName: input.ownerName,
    });
  } catch (failure) {
    // Leave nothing half-made: a failed owner login removes the shell again.
    await admin().from("restaurants").delete().eq("id", restaurantId);
    await admin().from("accounts").delete().eq("id", accountId);
    throw failure;
  }

  await admin().from("accounts").update({ owner_id: owner.userId }).eq("id", accountId);
  await admin().from("account_events").insert({
    account_id: accountId,
    kind: "onboarded",
    detail: { restaurant: restaurantId, model, product, plan: input.plan, owner: owner.email, ...(stays && input.sandbox ? { sandbox: true } : {}) },
    by_user: by,
  });
  return { restaurantId, accountId, ownerUserId: owner.userId, ownerEmail: owner.email };
}

/**
 * restaurant id → business model and XTSY product, for the console (platform_restaurants predates
 * both). Both live in restaurants.branding; no product means Restaurant POS (see products.ts).
 */
export async function restaurantModels(): Promise<Record<string, { model: string; product: string }>> {
  const { data } = await admin().from("restaurants").select("id, branding");
  const out: Record<string, { model: string; product: string }> = {};
  for (const r of (data ?? []) as { id: string; branding: { model?: string; product?: string } | null }[]) {
    out[r.id] = { model: r.branding?.model ?? "", product: r.branding?.product ?? "" };
  }
  return out;
}

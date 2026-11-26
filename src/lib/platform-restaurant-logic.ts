/**
 * Super admin: rules for onboarding a new outlet. Pure, tested.
 *
 * Every outlet runs the same software; the business model is recorded so the
 * console reads like the business does ("TAB Bistro — Fine Dine, Shillong")
 * and so model-specific features can key off it later.
 */

export type BusinessModel = "restaurant" | "fine_dine" | "cafe" | "cloud_kitchen" | "hotel" | "hostel";

export const BUSINESS_MODELS: { v: BusinessModel; l: string }[] = [
  { v: "restaurant", l: "Restaurant" },
  { v: "fine_dine", l: "Fine Dine" },
  { v: "cafe", l: "Café" },
  { v: "cloud_kitchen", l: "Cloud Kitchen" },
  { v: "hotel", l: "Hotel & Resort" },
  { v: "hostel", l: "Hostel" },
];

export const isBusinessModel = (v: string): v is BusinessModel => BUSINESS_MODELS.some((m) => m.v === v);
export const modelLabel = (v: string | null | undefined): string => BUSINESS_MODELS.find((m) => m.v === v)?.l ?? "";

/** Plans an outlet can be onboarded on. The owner plan and legacy catalogue entries are not offered. */
export const ONBOARDING_PLANS = ["basic", "pro_lite", "pro", "enterprise"] as const;
export type OnboardingPlan = (typeof ONBOARDING_PLANS)[number];
export const isOnboardingPlan = (v: string): v is OnboardingPlan => (ONBOARDING_PLANS as readonly string[]).includes(v);

/**
 * Hotel / Hostel / Resort POS have their own plans. Until stay prices are set (owner's decision,
 * 27 Nov 2026), they are onboarded only on the complimentary pilot plan: front desk, channel
 * manager and the café's billing. Never on the restaurant price list.
 */
export const STAY_PILOT_PLAN = "stay_pilot";
const STAY_PRODUCT_IDS = ["hotel_pos", "resort_pos", "hostel_pos"];
export const isStayProduct = (product: string | undefined) => !!product && STAY_PRODUCT_IDS.includes(product);
export function onboardingPlansFor(product: string | undefined): readonly string[] {
  return isStayProduct(product) ? [STAY_PILOT_PLAN] : ONBOARDING_PLANS;
}

/** The QR address as stored: trimmed, lower case; empty means none yet. */
export const cleanSlug = (text: string) => text.trim().toLowerCase();

/** Why this QR address can't be used, or null. Empty is fine — it can be set later. */
export function slugProblem(text: string): string | null {
  const s = cleanSlug(text);
  if (!s) return null;
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(s)) return "The QR address can use 3-40 lower-case letters, digits and dashes.";
  return null;
}

/** Why this outlet name can't be used, or null. */
export function nameProblem(text: string): string | null {
  const n = text.trim();
  if (n.length < 2) return "Give the outlet a name.";
  if (n.length > 60) return "Keep the name under 60 characters.";
  return null;
}

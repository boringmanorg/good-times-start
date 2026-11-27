/**
 * The published price list, read from the plans catalogue rather than written twice.
 *
 * The catalogue in the cloud is what the super admin edits and what actually enforces seats,
 * so it is the one truth. The website used to carry its own copy of the prices, which drifted
 * the moment a price changed in the console. Now the site reads the catalogue and falls back
 * to the compiled copy only if the read fails, so a pricing section never comes up empty.
 */
import { supabase } from "@/integrations/supabase/client";
import { FEATURES, PUBLIC_PLANS, type Feature, type PlanId, type PublicPlan } from "./plans";
import type { ProductId } from "./products";
import { modelPlanRows, SITE_MODELS } from "./site-models";

/** One row of the cloud catalogue, as the website needs it. */
export interface PlanCatalogueRow {
  id: string;
  name: string;
  monthly_price: number | null;
  quote: boolean | null;
  tagline: string | null;
  billdesk_seats: number | null;
  waiter_seats: number | null;
  admin_seats: number | null;
  features: Record<string, boolean> | null;
  active: boolean | null;
  sort: number | null;
  max_outlets?: number | null;
  included_rooms?: number | null;
  extra_room_price?: number | null;
}

/** The plans offered to the public, in ladder order. Other catalogue rows are internal. */
export const PUBLIC_PLAN_IDS: PlanId[] = ["basic", "pro_lite", "pro", "enterprise"];

/**
 * A catalogue row as the website shows it. A row marked `quote` has no public price, whatever
 * number is stored against it — "call for quote" is a decision, not a missing value.
 */
export function planFromRow(row: PlanCatalogueRow, highlightId: string = "pro"): PublicPlan {
  const fallback = PUBLIC_PLANS.find((p) => p.id === row.id);
  return {
    id: row.id as PlanId,
    name: row.name || fallback?.name || row.id,
    price: row.quote ? null : row.monthly_price ?? null,
    tagline: row.tagline || fallback?.tagline || "",
    seats: { pos: row.billdesk_seats, waiter: row.waiter_seats, manager: row.admin_seats },
    features: FEATURES.filter((f) => row.features?.[f] === true) as Feature[],
    ...(row.included_rooms !== undefined ? { includedRooms: row.included_rooms, extraRoomPrice: row.extra_room_price ?? null } : {}),
    ...(row.max_outlets != null ? { maxProperties: row.max_outlets } : {}),
    ...(row.id === highlightId ? { highlight: true } : {}),
  };
}

/** Catalogue rows → the public ladder, in the order the price cards read. */
export function publicPlansFrom(rows: PlanCatalogueRow[]): PublicPlan[] {
  const wanted = rows.filter((r) => PUBLIC_PLAN_IDS.includes(r.id as PlanId) && r.active !== false);
  if (!wanted.length) return PUBLIC_PLANS;
  return wanted
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || PUBLIC_PLAN_IDS.indexOf(a.id as PlanId) - PUBLIC_PLAN_IDS.indexOf(b.id as PlanId))
    .map((r) => planFromRow(r));
}

/** Lowest and highest published price, for the page's structured data. Quote-only plans have none. */
export function priceRange(plans: PublicPlan[]): { low: number; high: number; count: number } {
  const prices = plans.map((p) => p.price).filter((p): p is number => p !== null);
  if (!prices.length) return { low: 0, high: 0, count: plans.length };
  return { low: Math.min(...prices), high: Math.max(...prices), count: plans.length };
}

/**
 * Read the live catalogue. Anyone may read active plans, so this works for a signed-out
 * visitor on the website. Any failure falls back to the compiled list rather than showing
 * nothing: a price that is a few hours stale beats an empty pricing section.
 */
export async function loadPublicPlans(): Promise<PublicPlan[]> {
  try {
    const { data, error } = await supabase
      .from("plans")
      .select("id, name, monthly_price, quote, tagline, billdesk_seats, waiter_seats, admin_seats, features, active, sort, max_outlets, included_rooms, extra_room_price");
    if (error || !data) return PUBLIC_PLANS;
    return publicPlansFrom(data as unknown as PlanCatalogueRow[]);
  } catch {
    return PUBLIC_PLANS;
  }
}

/** Everything the website needs from the catalogue in one read: every active row, or none on failure. */
export async function loadCatalogue(): Promise<PlanCatalogueRow[]> {
  try {
    const { data, error } = await supabase
      .from("plans")
      .select("id, name, monthly_price, quote, tagline, billdesk_seats, waiter_seats, admin_seats, features, active, sort, max_outlets, included_rooms, extra_room_price");
    if (error || !data) return [];
    return (data as unknown as PlanCatalogueRow[]).filter((r) => r.active !== false);
  } catch {
    return [];
  }
}

/**
 * One model's public plans from the catalogue rows. Restaurant POS uses its fixed ladder (with the
 * compiled fallback); every other model shows its own prefixed rows, or nothing ("on request").
 */
export function plansForModel(rows: PlanCatalogueRow[], id: ProductId): PublicPlan[] {
  if (id === "restaurant_pos") return publicPlansFrom(rows);
  const mine = modelPlanRows(rows, id);
  const middle = mine.length >= 3 ? mine[Math.floor((mine.length - 1) / 2) + (mine.length % 2 === 0 ? 1 : 0)]?.id : undefined;
  return mine.map((r) => planFromRow(r, middle ?? "__none__"));
}

/** Every model's plans, keyed by the model's name, for the plan builder and the enquiry form. */
export function plansByModelFrom(rows: PlanCatalogueRow[]): Record<string, PublicPlan[]> {
  return Object.fromEntries(SITE_MODELS.map((m) => [m.name, plansForModel(rows, m.id)]));
}

import { featureOn } from "./plans";
import { useEntitlements } from "./use-entitlements";
import { useRestaurantSettings } from "./use-settings";

/**
 * The loyalty % that applies on this outlet: the admin's setting, or 0 when the plan has no
 * loyalty programme (Basic). Points already earned are kept; they just aren't shown or spent.
 */
export function useLoyaltyPct(fallback = 0): number {
  const settings = useRestaurantSettings();
  const plan = useEntitlements();
  return featureOn(plan, "loyalty") ? (settings.loyaltyPct ?? fallback) : 0;
}

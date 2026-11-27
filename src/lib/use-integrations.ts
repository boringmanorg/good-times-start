import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-app";
import { isPlatform, type IntegrationLink } from "./aggregator-logic";

/**
 * This restaurant's Swiggy/Zomato links (sandbox or live), read by staff so the POS listens for
 * platform orders even when the restaurant's own QR ordering is off (Pro Lite has no QR ordering).
 * A cloud without the table, or no connection, reads as "none": never an error on the counter.
 */
export function useIntegrations(restaurantId: string | null | undefined) {
  return useQuery({
    queryKey: ["integrations", restaurantId ?? null],
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async (): Promise<IntegrationLink[]> => {
      const { data, error } = await (supabase.from as unknown as (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { platform: string; mode: string; store_id: string }[] | null; error: unknown }> } })("restaurant_integrations")
        .select("platform, mode, store_id").eq("restaurant_id", restaurantId ?? "");
      if (error || !data) return [];
      return data.filter((r) => isPlatform(r.platform) && (r.mode === "sandbox" || r.mode === "live"))
        .map((r) => ({ platform: r.platform as IntegrationLink["platform"], mode: r.mode as IntegrationLink["mode"], storeId: r.store_id ?? "" }));
    },
  });
}

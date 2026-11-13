import { useSyncExternalStore } from "react";
import { currentPolicy, subscribePolicy } from "@/lib/permissions";

/** Re-render when the admin changes what roles may do. */
export function usePolicy() {
  return useSyncExternalStore(subscribePolicy, currentPolicy, currentPolicy);
}

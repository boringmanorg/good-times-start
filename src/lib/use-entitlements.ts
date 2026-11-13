import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "./staff";
import type { Entitlements } from "./plans";

/*
 * What this restaurant's plan includes, as the cloud says. Remembered on the device so the
 * same limits apply offline; never fetched → null (everything on, see featureOn).
 */
const KEY = (rid: string) => `xtsy-entitlements:${rid}`;
let current: { rid: string; ent: Entitlements | null } = { rid: "", ent: null };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function read(rid: string): Entitlements | null {
  try { const raw = window.localStorage.getItem(KEY(rid)); return raw ? (JSON.parse(raw) as Entitlements) : null; } catch { return null; }
}

export async function refreshEntitlements(rid: string): Promise<Entitlements | null> {
  const { data, error } = await supabase.rpc("restaurant_entitlements" as never, { _restaurant: rid } as never) as unknown as { data: Entitlements | null; error: { message: string } | null };
  if (error) return current.rid === rid ? current.ent : null; // offline or older cloud: keep what we know
  try { if (data) window.localStorage.setItem(KEY(rid), JSON.stringify(data)); else window.localStorage.removeItem(KEY(rid)); } catch { /* storage unavailable */ }
  current = { rid, ent: data ?? null };
  emit();
  return current.ent;
}

export function useEntitlements(): Entitlements | null {
  const { user } = useStaff();
  const rid = user?.restaurantId ?? "";
  if (typeof window !== "undefined" && rid && current.rid !== rid) current = { rid, ent: read(rid) };
  useEffect(() => {
    if (!rid) return;
    void refreshEntitlements(rid);
    const timer = window.setInterval(() => void refreshEntitlements(rid), 10 * 60_000);
    const online = () => void refreshEntitlements(rid);
    window.addEventListener("online", online);
    return () => { window.clearInterval(timer); window.removeEventListener("online", online); };
  }, [rid]);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (current.rid === rid ? current.ent : null),
    () => null,
  );
}

import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "./db";
import { can } from "./permissions";
import { getDeviceId } from "./terminal-actions";
import { useRestaurantSettings } from "./use-settings";
import type { RestaurantSettings } from "./types";

export type MarketingDenied = "role" | "terminal" | "loading";

/**
 * Marketing is an admin tool that opens only on terminals the admin has enabled (Settings → Terminals).
 * The list lives in the restaurant settings, which only the owner or a manager can change, and syncs to
 * every terminal, so each one knows offline whether it may open Marketing.
 */
export function marketingAccess(role: string | undefined, settings: Pick<RestaurantSettings, "marketingDevices">, deviceId: string | null): MarketingDenied | null {
  if (!can(role ? { role: role as never } : null, "marketing.manage")) return "role";
  if (!deviceId) return "loading";
  return settings.marketingDevices?.includes(deviceId) ? null : "terminal";
}

export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { let live = true; void getDeviceId().then((d) => { if (live) setId(d); }).catch(() => {}); return () => { live = false; }; }, []);
  return id;
}

export function useMarketingAccess(role: string | undefined): { denied: MarketingDenied | null; deviceId: string | null } {
  const settings = useRestaurantSettings();
  const deviceId = useDeviceId();
  return { denied: marketingAccess(role, settings, deviceId), deviceId };
}

/** Admin only: switch Marketing on or off for one terminal. Saved like any setting, so it works offline and syncs. */
export async function setMarketingTerminal(user: { role: string } | null, deviceId: string, on: boolean): Promise<void> {
  if (!can(user as never, "terminals.manage")) throw new Error("Only the owner or a manager can enable Marketing on a terminal.");
  if (!/^[a-z0-9-]{8,64}$/.test(deviceId)) throw new Error("Unknown terminal.");
  const settings = await getSettings();
  const list = new Set(settings.marketingDevices ?? []);
  if (on) list.add(deviceId); else list.delete(deviceId);
  await saveSettings({ ...settings, marketingDevices: [...list].sort() });
}

/** Changes waiting to upload, and an upload attempt whenever the connection returns (and every minute while any wait). */
export function useMarketingOutbox(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const refresh = () => { void import("./marketing-actions").then((m) => m.readOutbox()).then((ops) => { if (live) setCount(ops.length); }); };
    const flush = () => { void import("./marketing-actions").then((m) => m.flushMarketingOutbox()).then(refresh).catch(refresh); };
    let unsubscribe = () => {};
    void import("./marketing-actions").then((m) => { if (live) unsubscribe = m.subscribeMarketingOutbox(refresh); });
    refresh(); flush();
    window.addEventListener("online", flush);
    const timer = window.setInterval(() => { if (navigator.onLine) flush(); }, 60_000);
    return () => { live = false; unsubscribe(); window.removeEventListener("online", flush); window.clearInterval(timer); };
  }, [enabled]);
  return count;
}

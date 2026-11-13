import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDb, getDeviceCode } from "./db";
import type { AppKind, DeviceKind } from "./staff-login-logic";

/*
 * Terminals: every device checks in with its bill series, app and login, so
 * the admin can see, rename, block or release it in Settings → Terminals.
 * A blocked device stops working for staff logins; the admin can still sign in.
 */

export interface Terminal {
  device_id: string; series: string; description: string; app: "" | AppKind; device_kind: "" | DeviceKind;
  login_email: string; status: "active" | "blocked" | "over_plan" | "pending"; first_seen: string; last_seen: string;
  last_ip?: string | null; last_location?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };

export async function getDeviceId(): Promise<string> {
  const meta = getDb().meta;
  return getDb().transaction("rw", meta, async () => {
    const stored = (await meta.get("deviceId"))?.value;
    if (typeof stored === "string" && /^[a-z0-9-]{8,64}$/.test(stored)) return stored;
    const id = crypto.randomUUID().toLowerCase();
    await meta.put({ key: "deviceId", value: id });
    return id;
  });
}

/* This device's status, remembered so a blocked device stays blocked offline. */
const STATUS_KEY = "xtsy-terminal-status";
export type Status = "active" | "blocked" | "over_plan" | "pending";
const isStatus = (v: unknown): v is Status => v === "active" || v === "blocked" || v === "over_plan" || v === "pending";
let status: Status = (() => { try { const s = window.localStorage.getItem(STATUS_KEY); return isStatus(s) ? s : "active"; } catch { return "active"; } })();
const listeners = new Set<() => void>();
export function setTerminalStatus(next: Status) {
  if (next === status) return;
  status = next;
  try { window.localStorage.setItem(STATUS_KEY, next); } catch { /* storage unavailable */ }
  for (const l of listeners) l();
}
export function useTerminalStatus(): Status {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => status, () => "active" as Status);
}

/** Check in. Quiet on failure: being offline never blocks a device (a new one waits for approval once it has checked in). */
export async function touchTerminal(restaurantId: string, app: AppKind, kind: DeviceKind): Promise<void> {
  try {
    const [device, series] = await Promise.all([getDeviceId(), getDeviceCode()]);
    const { data, error } = await db().rpc("touch_terminal", { _restaurant: restaurantId, _device: device, _series: series, _app: app, _kind: kind });
    if (error) return;
    if (isStatus(data)) setTerminalStatus(data);
    void import("./terminal-network.functions")
      .then((m) => m.recordTerminalNetwork({ data: { restaurantId, deviceId: device } }))
      .catch(() => { /* optional */ });
  } catch { /* offline */ }
}

export async function loadTerminals(restaurantId: string): Promise<Terminal[]> {
  const { data, error } = await db().from("terminals").select("device_id, series, description, app, device_kind, login_email, status, first_seen, last_seen, last_ip, last_location")
    .eq("restaurant_id", restaurantId).order("last_seen", { ascending: false });
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? "") ? "The database needs updating first (migration 0011)." : "Couldn't load terminals. Check the internet.");
  return (data ?? []) as Terminal[];
}

export async function updateTerminal(restaurantId: string, deviceId: string, patch: { description?: string; status?: Status }): Promise<void> {
  const { data, error } = await db().from("terminals").update(patch).eq("restaurant_id", restaurantId).eq("device_id", deviceId).select("device_id");
  if (error || !(data as unknown[] | null)?.length) throw new Error("Couldn't save. Only the admin can change terminals.");
}

/** Forget a device (replaced or lost). If it's used again it checks in as new. */
export async function releaseTerminal(restaurantId: string, deviceId: string): Promise<void> {
  const { error } = await db().from("terminals").delete().eq("restaurant_id", restaurantId).eq("device_id", deviceId);
  if (error) throw new Error("Couldn't release the terminal.");
}

/** The waiting device: the admin types the 60-second admin code here, and the terminal gets its name. */
export async function approveThisTerminal(restaurantId: string, name: string, code: string): Promise<Status> {
  const device = await getDeviceId();
  const { data, error } = await db().rpc("approve_this_terminal", { _restaurant: restaurantId, _device: device, _name: name, _code: code.replace(/\D/g, "") });
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message ?? "") ? "The cloud update for terminal approval isn't applied yet." : (error.message ?? "Couldn't approve. Check the internet."));
  if (isStatus(data)) setTerminalStatus(data);
  return isStatus(data) ? data : "pending";
}

/** POS Manager: approve (with a name) or turn away a waiting terminal. */
export async function decideTerminal(restaurantId: string, deviceId: string, name: string, approve: boolean): Promise<string> {
  const { data, error } = await db().rpc("decide_terminal", { _restaurant: restaurantId, _device: deviceId, _name: name, _approve: approve });
  if (error) throw new Error(error.message ?? "Couldn't save. Check the internet.");
  return String(data);
}

/** Names that are just the app's own, i.e. the terminal hasn't really been named. */
export const unnamedTerminal = (description: string | null | undefined) =>
  !description || /^(pos billdesk|pos manager|waiter pro|restro pos|pos business manager|pos waiter|business manager)$/i.test(description.trim());

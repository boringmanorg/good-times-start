/*
 * When a cloud call hangs although the internet works, the app's own cloud connection is
 * stuck (seen on the Reception counter, 26 Nov: no check-in for 1.5 h while the Wi-Fi was
 * fine; a reload fixed it). This check goes round the app's client with a plain request,
 * so it can tell "no internet" from "stuck connection".
 */

export const CLOUD_STUCK_EVENT = "xtsy-cloud-stuck";
export const STUCK_MESSAGE = "POS lost its link to the cloud, but the internet is working. Tap Reconnect — your items are saved.";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** True when the cloud answers a plain request within `waitMs`. */
export async function cloudReachable(url: string | undefined, key: string | undefined, fetcher: Fetch = fetch, waitMs = 5000): Promise<boolean> {
  if (!url) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), waitMs);
  try {
    const res = await fetcher(`${url.replace(/\/+$/, "")}/auth/v1/health`, { headers: key ? { apikey: key } : {}, signal: abort.signal, cache: "no-store" });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Probe the cloud; when it answers, tell the shell the app's connection is stuck. */
export async function reportIfStuck(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ok = await cloudReachable(import.meta.env["VITE_SUPABASE_URL"], import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]);
  if (ok) window.dispatchEvent(new CustomEvent(CLOUD_STUCK_EVENT));
  return ok;
}

/**
 * True inside Lovable's editor preview (and local development): id-preview--*.lovable.app,
 * preview--*.lovable.app, *.lovableproject.com and localhost. The preview is XTSY's own
 * workbench, not a restaurant device, so it never registers as a terminal and never goes
 * through first-login terminal approval.
 */
export function isLovablePreview(hostname = typeof window === "undefined" ? "" : window.location.hostname): boolean {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return true;
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  return ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"].some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

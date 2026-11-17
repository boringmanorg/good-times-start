/**
 * WhatsApp review request: a thank-you that sends the guest to the restaurant's Google profile
 * and Instagram (links from Marketing → Brand). Pure, tested. Staff send it by hand from the
 * guest's page, so it is never automatic and never goes to a guest without a phone number.
 */
import type { BrandLinks } from "./marketing-logic";

/** Only https links (or an @handle for Instagram) are put in front of a guest. */
function safeUrl(url: string | undefined): string | null {
  const v = (url ?? "").trim();
  return /^https:\/\/\S+$/i.test(v) ? v : null;
}
function instagramUrl(v: string | undefined): string | null {
  const raw = (v ?? "").trim();
  const handle = raw.match(/^@?([A-Za-z0-9._]{1,30})$/)?.[1];
  return handle ? `https://instagram.com/${handle}` : safeUrl(raw);
}

/** Whether there is anything to send: at least one of the two links is set up. */
export function reviewLinks(links: BrandLinks | undefined): { google: string | null; instagram: string | null } {
  return { google: safeUrl(links?.googleReview), instagram: instagramUrl(links?.instagram) };
}

export function reviewMessage(opts: { guest?: string | undefined; restaurant: string; links: BrandLinks | undefined }): string | null {
  const { google, instagram } = reviewLinks(opts.links);
  if (!google && !instagram) return null;
  const first = (opts.guest ?? "").trim().split(/\s+/)[0];
  const lines = [
    `Hi${first ? ` ${first}` : ""}, thank you for dining with ${opts.restaurant || "us"}!`,
    "We'd love to hear how it was.",
  ];
  if (google) lines.push("", `⭐ Rate us on Google: ${google}`);
  if (instagram) lines.push("", `📸 Follow us on Instagram: ${instagram}`);
  return lines.join("\n");
}

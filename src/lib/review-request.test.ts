import { describe, expect, it } from "vitest";
import { reviewMessage } from "./review-request";

describe("WhatsApp review request", () => {
  it("names the guest and carries the Google and Instagram links", () => {
    const m = reviewMessage({ guest: "Priya Sharma", restaurant: "TAB Bistro", links: { googleReview: "https://g.page/r/abc/review", instagram: "@tabbistro" } })!;
    expect(m).toContain("Hi Priya,");
    expect(m).toContain("https://g.page/r/abc/review");
    expect(m).toContain("https://instagram.com/tabbistro");
  });
  it("sends nothing when no link is set up", () => {
    expect(reviewMessage({ restaurant: "TAB", links: {} })).toBeNull();
  });
  it("never sends a non-https link", () => {
    expect(reviewMessage({ restaurant: "TAB", links: { googleReview: "javascript:alert(1)" } })).toBeNull();
  });
});

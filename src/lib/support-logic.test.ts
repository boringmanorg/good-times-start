import { describe, expect, it } from "vitest";
import { HANDOFF_TTL_MS, readHandoff, readSupport, sessionFromHandoff, supportAppFor, supportBannerText, supportHome, supportReasonProblem } from "./support-logic";

const handoff = { accessToken: "a".repeat(30), refreshToken: "r", restaurantId: "rid", restaurantName: "TAB Bistro", email: "billdesk@xtsy.pos", role: "cashier", displayName: "Billdesk", reason: "Checking a sync error", by: "admin@xtsy.one", at: 1_000_000 };

describe("Sign in as", () => {
  it("needs a real reason", () => {
    expect(supportReasonProblem("")).toMatch(/why/);
    expect(supportReasonProblem("fix")).toMatch(/8 characters/);
    expect(supportReasonProblem("Owner asked to check the bill sync")).toBeNull();
    expect(supportReasonProblem("x".repeat(201))).toMatch(/200/);
  });
  it("opens the user's own app", () => {
    expect(supportAppFor("admin@xtsy.pos", "owner")).toBe("manager");
    expect(supportAppFor("billdesk@xtsy.pos", "cashier")).toBe("pos");
    expect(supportAppFor("waiter@xtsy.pos", "captain")).toBe("waiter");
    expect(supportAppFor("ravi@tabbistro.pos", "captain")).toBe("waiter");
    expect(supportAppFor("chef@tabbistro.pos", "kitchen")).toBe("pos");
    expect(supportHome("chef@tabbistro.pos", "kitchen")).toBe("/tables");
    expect(supportHome("admin@xtsy.pos", "owner")).toBe("/dashboard");
  });
  it("uses a handoff once, only while fresh", () => {
    const raw = JSON.stringify(handoff);
    expect(readHandoff(raw, handoff.at + 1000)?.email).toBe("billdesk@xtsy.pos");
    expect(readHandoff(raw, handoff.at + HANDOFF_TTL_MS + 1)).toBeNull();
    expect(readHandoff(raw, handoff.at - 60_000)).toBeNull();
    expect(readHandoff("{bad", handoff.at)).toBeNull();
    expect(readHandoff(JSON.stringify({ ...handoff, accessToken: 1 }), handoff.at)).toBeNull();
    expect(readHandoff(null)).toBeNull();
  });
  it("keeps no tokens in the session it remembers", () => {
    const s = sessionFromHandoff(handoff, 5);
    expect(JSON.stringify(s)).not.toContain("aaaa");
    expect(readSupport(JSON.stringify(s))?.startedAt).toBe(5);
    expect(supportBannerText(s)).toBe("XTSY support · signed in as Billdesk (billdesk@xtsy.pos) at TAB Bistro");
  });
});

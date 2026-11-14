import { describe, expect, it } from "vitest";
import {
  BUSINESS_MODELS, ONBOARDING_PLANS, cleanSlug, isBusinessModel, isOnboardingPlan,
  modelLabel, nameProblem, slugProblem,
} from "./platform-restaurant-logic";

describe("onboarding a new outlet", () => {
  it("offers the five business models XTSY sells today", () => {
    expect(BUSINESS_MODELS.map((m) => m.v)).toEqual(["restaurant", "fine_dine", "cafe", "cloud_kitchen", "hotel"]);
    expect(isBusinessModel("cloud_kitchen")).toBe(true);
    expect(isBusinessModel("tourism")).toBe(false); // not launched yet
    expect(modelLabel("fine_dine")).toBe("Fine Dine");
    expect(modelLabel(null)).toBe("");
  });

  it("onboards only onto the four public plans", () => {
    expect([...ONBOARDING_PLANS]).toEqual(["basic", "pro_lite", "pro", "enterprise"]);
    expect(isOnboardingPlan("pro_lite")).toBe(true);
    for (const hidden of ["owner", "trial", "starter", "growth", "chain"]) {
      expect(isOnboardingPlan(hidden)).toBe(false);
    }
  });

  it("checks the outlet name", () => {
    expect(nameProblem("TAB Bistro by XTSY")).toBeNull();
    expect(nameProblem(" A ")).toMatch(/name/i);
    expect(nameProblem("x".repeat(61))).toMatch(/60/);
  });

  it("checks the QR address, and allows none yet", () => {
    expect(slugProblem("")).toBeNull();
    expect(slugProblem("  ")).toBeNull();
    expect(slugProblem("tab-bistro-qr")).toBeNull();
    expect(slugProblem("ab")).toMatch(/3-40/);
    expect(slugProblem("Tab_Bistro")).toMatch(/3-40/);
    expect(slugProblem("-leading")).toMatch(/3-40/);
    expect(cleanSlug("  TAB-Bistro  ")).toBe("tab-bistro");
  });
});

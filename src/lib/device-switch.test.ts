import { describe, expect, it } from "vitest";
import { deviceSwitchDecision } from "./device-switch";

describe("switching a device to another outlet", () => {
  it("keeps a fresh device or the same outlet's copy", () => {
    expect(deviceSwitchDecision(undefined, ["a"], 0, 0)).toEqual({ action: "keep" });
    expect(deviceSwitchDecision("a", ["a", "b"], 3, 1)).toEqual({ action: "keep" });
  });
  it("clears another outlet's copy once everything has synced", () => {
    expect(deviceSwitchDecision("tab", ["hostel"], 0, 0)).toEqual({ action: "clear" });
  });
  it("refuses while that outlet has changes or unsent items left", () => {
    expect(deviceSwitchDecision("tab", ["hostel"], 2, 0)).toMatchObject({ action: "refuse", reason: expect.stringMatching(/2 changes .* haven't reached the cloud/) });
    expect(deviceSwitchDecision("tab", ["hostel"], 0, 1)).toMatchObject({ action: "refuse", reason: expect.stringMatching(/unsent items/) });
  });
});

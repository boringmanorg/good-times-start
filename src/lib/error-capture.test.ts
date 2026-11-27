import { describe, expect, it } from "vitest";
import { describeError, redactPersonal } from "./error-capture";

describe("server logs carry no personal details", () => {
  it("hides emails and Indian mobile numbers", () => {
    expect(redactPersonal("A user with this email address (admin@cloudnine.pos) has already been registered")).toBe("A user with this email address ([email]) has already been registered");
    expect(redactPersonal("call +91 9876543210 or 919812345678 or 8812345678")).toBe("call [phone] or [phone] or [phone]");
  });
  it("leaves timestamps, ids and amounts alone", () => {
    const t = "at 1795756878646 id 3bbdddb7-1111-4111-8111-111111111111 total 12345 POS/0136";
    expect(redactPersonal(t)).toBe(t);
  });
  it("applies to expanded errors", () => {
    expect(redactPersonal(describeError(new Error("dup admin@x.pos")))).toContain("dup [email]");
  });
});

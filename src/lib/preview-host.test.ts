import { describe, expect, it } from "vitest";
import { isLovablePreview } from "./preview-host";

describe("Lovable preview detection", () => {
  it("treats the editor preview and local development as XTSY's workbench", () => {
    for (const h of ["id-preview--1af0545d.lovable.app", "preview--good-times-start.lovable.app", "abc.lovableproject.com", "localhost", "127.0.0.1"]) {
      expect(isLovablePreview(h)).toBe(true);
    }
  });
  it("treats the live site and anything else as real terminals", () => {
    for (const h of ["good-times-start.lovable.app", "pos.xtsy.one", "xtsypos.com", ""]) {
      expect(isLovablePreview(h)).toBe(false);
    }
  });
});

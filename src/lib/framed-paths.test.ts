import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isFramedPath } from "./framed-paths";
import { formatINR } from "./billing";
import { paymentLine } from "./payment-logic";

describe("staff screens share the frame", () => {
  it("every nav screen (except the Waiter app) runs inside the persistent frame and its gates", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    const nav = [...shell.matchAll(/\{ to: "(\/[a-z]*)", label:/g)].map((m) => m[1] ?? "").filter((p) => p !== "/waiter");
    expect(nav).toContain("/accounts");
    expect(nav.filter((p) => !isFramedPath(p))).toEqual([]);
  });
});

describe("plain-word money", () => {
  it("never shows ₹-0", () => {
    expect(formatINR(-0, 0)).toBe("₹0");
    expect(formatINR(-0.001)).toBe("₹0.00");
    expect(formatINR(-5, 0)).toBe("₹-5");
  });
  it("Swiggy and Zomato bills read 'Paid on …'", () => {
    expect(paymentLine("wallet", "swiggy", "Wallet")).toBe("Paid on Swiggy");
    expect(paymentLine("wallet", "zomato", "Wallet")).toBe("Paid on Zomato");
    expect(paymentLine("wallet", "dine-in", "Wallet")).toBe("Paid by Wallet");
    expect(paymentLine("credit", "swiggy", "Due")).toBe("Due");
  });
});

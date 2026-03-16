import { describe, it, expect } from "vitest";
import { COUNTRIES } from "@/lib/countries";

/**
 * Supporting test for BDD 2.6: Profile setup — country selection
 */

describe("Countries data", () => {
  it("has countries loaded", () => {
    expect(COUNTRIES.length).toBeGreaterThan(100);
  });

  it("each country has a code and name", () => {
    COUNTRIES.forEach((c) => {
      expect(c.code).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.code.length).toBeLessThanOrEqual(3);
    });
  });

  it("has no duplicate country codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes common countries", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toContain("United States");
    expect(names).toContain("Canada");
    expect(names).toContain("United Kingdom");
  });
});

import { describe, it, expect } from "vitest";
import { regionsForCountryName, countryHasRegions } from "@/lib/regions";

// Covers (bdd-gate): src/lib/regions.ts — the Welcome Flow Profile step's State dropdown
// source. State appears only for countries with a region list, keyed off the country NAME
// stored in profiles.country. ADR 20261115-welcome-flow-prototype-fidelity.

describe("regions — state/province lookup by country name", () => {
  it("returns US states for United States (incl. Oregon, the prototype's example)", () => {
    const regions = regionsForCountryName("United States");
    expect(countryHasRegions("United States")).toBe(true);
    expect(regions.map((r) => r.name)).toContain("Oregon");
    expect(regions.length).toBeGreaterThanOrEqual(51); // 50 states + DC (+ PR)
  });

  it("returns Canadian provinces and Australian states", () => {
    expect(regionsForCountryName("Canada").map((r) => r.name)).toContain("Ontario");
    expect(regionsForCountryName("Australia").map((r) => r.name)).toContain("Victoria");
  });

  it("has no region list for a country we do not subdivide (data minimization)", () => {
    expect(countryHasRegions("France")).toBe(false);
    expect(regionsForCountryName("France")).toEqual([]);
  });

  it("is empty/safe for null, undefined, empty, or unknown country names", () => {
    expect(regionsForCountryName(null)).toEqual([]);
    expect(regionsForCountryName(undefined)).toEqual([]);
    expect(regionsForCountryName("")).toEqual([]);
    expect(regionsForCountryName("Narnia")).toEqual([]);
    expect(countryHasRegions(null)).toBe(false);
  });

  it("every region has a non-empty code and name", () => {
    for (const country of ["United States", "Canada", "Australia"]) {
      for (const r of regionsForCountryName(country)) {
        expect(r.code).toBeTruthy();
        expect(r.name).toBeTruthy();
      }
    }
  });
});

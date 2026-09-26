import { describe, it, expect } from "vitest";
import { getOpeningCategory } from "@/lib/projects/opening-category";

/**
 * The Project Openings tab partition (ADR-0057). A Shipathon is exclusive to the Hackathons tab —
 * it must NOT also land under Client/Volunteer — and the existing client/volunteer split is
 * unchanged for non-Shipathon openings.
 */
describe("getOpeningCategory", () => {
  it("routes a Shipathon to Hackathons regardless of client kind", () => {
    expect(getOpeningCategory({ is_shipathon: true, clientKind: "external" })).toBe("hackathon");
    expect(getOpeningCategory({ is_shipathon: true, clientKind: "internal" })).toBe("hackathon");
  });

  it("routes an internal-client non-Shipathon to Volunteer (unchanged)", () => {
    expect(getOpeningCategory({ is_shipathon: false, clientKind: "internal" })).toBe("volunteer");
  });

  it("routes an external-client non-Shipathon to Client (unchanged)", () => {
    expect(getOpeningCategory({ is_shipathon: false, clientKind: "external" })).toBe("client");
  });

  it("treats a missing/undefined is_shipathon as not-a-hackathon (fail-safe)", () => {
    expect(getOpeningCategory({ clientKind: "external" })).toBe("client");
    expect(getOpeningCategory({ clientKind: "internal" })).toBe("volunteer");
    expect(getOpeningCategory({ is_shipathon: null, clientKind: "external" })).toBe("client");
  });

  it("defaults an unknown/absent client kind to Client", () => {
    expect(getOpeningCategory({})).toBe("client");
  });
});

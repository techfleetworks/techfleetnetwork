import { describe, it, expect } from "vitest";
import { getProjectApplicationSubmissionState } from "@/lib/applications/project-application-status";

/**
 * Guards the fix for the "you've already submitted" defect (ADR-0065): a started-but-unsubmitted
 * draft must never be reported as submitted. The whole point is that row existence != submitted —
 * only status === 'completed' is submitted; everything else on an existing row is a resumable draft.
 */
describe("getProjectApplicationSubmissionState", () => {
  it("returns 'none' when there is no application row", () => {
    expect(getProjectApplicationSubmissionState(null)).toBe("none");
    expect(getProjectApplicationSubmissionState(undefined)).toBe("none");
  });

  it("returns 'completed' only for status === 'completed'", () => {
    expect(getProjectApplicationSubmissionState({ status: "completed" })).toBe("completed");
  });

  it("returns 'draft' for a draft row", () => {
    expect(getProjectApplicationSubmissionState({ status: "draft" })).toBe("draft");
  });

  it("treats a started-but-unsubmitted row as 'draft', never 'completed' (the reported bug)", () => {
    // fail-safe: a missing/null/unknown status on an EXISTING row is 'draft', not 'completed'
    expect(getProjectApplicationSubmissionState({})).toBe("draft");
    expect(getProjectApplicationSubmissionState({ status: null })).toBe("draft");
    expect(getProjectApplicationSubmissionState({ status: "in_review" })).toBe("draft");
  });
});

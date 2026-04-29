import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ProjectAnalysisContent OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "components", "admin", "ProjectAnalysisContent.tsx"), "utf8");

  it("SEC-PROJECT-ANALYSIS-PROJECTION-050: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-PROJECT-ANALYSIS-PROJECTION-050: uses allowlists for analysis reads", () => {
    expect(source).toContain("PROJECT_ANALYSIS_COMPLETED_APPLICATION_COLUMNS");
    expect(source).toContain("PROJECT_ANALYSIS_CROSS_APPLICATION_COLUMNS");
    expect(source).toContain("PROJECT_ANALYSIS_PROJECT_COLUMNS");
    expect(source).toContain("PROJECT_ANALYSIS_APPLY_NOW_COLUMNS");
    expect(source).toContain("PROJECT_ANALYSIS_PROFILE_COLUMNS");
    expect(source).toContain(".select(PROJECT_ANALYSIS_COMPLETED_APPLICATION_COLUMNS)");
    expect(source).toContain(".select(PROJECT_ANALYSIS_CROSS_APPLICATION_COLUMNS)");
    expect(source).toContain(".select(PROJECT_ANALYSIS_PROJECT_COLUMNS)");
    expect(source).toContain(".select(PROJECT_ANALYSIS_APPLY_NOW_COLUMNS)");
    expect(source).toContain(".select(PROJECT_ANALYSIS_PROFILE_COLUMNS)");
  });

  it("SEC-PROJECT-ANALYSIS-PROJECTION-050: excludes long-form application answers and unrelated metadata", () => {
    expect(source).toContain("team_hats_interest");
    expect(source).toContain("participated_previous_phase");
    expect(source).not.toContain("passion_for_project");
    expect(source).not.toContain("client_project_knowledge");
    expect(source).not.toContain("project_success_contribution");
    expect(source).not.toContain("private_metadata");
    expect(source).not.toContain("internal_notes");
    expect(source).not.toContain("billing");
  });
});

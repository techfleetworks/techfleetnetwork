import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("MyProjectApplicationsPage OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "MyProjectApplicationsPage.tsx"), "utf8");

  it("SEC-MY-PROJECT-APPLICATIONS-PROJECTION-046: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-MY-PROJECT-APPLICATIONS-PROJECTION-046: uses allowlists for listing reads", () => {
    expect(source).toContain("MY_PROJECT_APPLICATION_COLUMNS");
    expect(source).toContain("MY_PROJECT_APPLICATION_PROJECT_COLUMNS");
    expect(source).toContain(".select(MY_PROJECT_APPLICATION_COLUMNS)");
    expect(source).toContain(".select(MY_PROJECT_APPLICATION_PROJECT_COLUMNS)");
  });

  it("SEC-MY-PROJECT-APPLICATIONS-PROJECTION-046: does not over-fetch long-form application responses", () => {
    expect(source).toContain('"applicant_status"');
    expect(source).toContain('"team_hats_interest"');
    expect(source).toContain('"team_hats"');
    expect(source).not.toContain("passion_for_project");
    expect(source).not.toContain("client_project_knowledge");
    expect(source).not.toContain("project_success_contribution");
    expect(source).not.toContain("cross_functional_contribution");
  });
});
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("SubmittedApplicationsTab OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "components", "SubmittedApplicationsTab.tsx"), "utf8");

  it("SEC-SUBMITTED-APPLICATIONS-PROJECTION-047: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-SUBMITTED-APPLICATIONS-PROJECTION-047: uses allowlists for admin review reads", () => {
    expect(source).toContain("SUBMITTED_PROJECT_APPLICATION_COLUMNS");
    expect(source).toContain("SUBMITTED_GENERAL_APPLICATION_COLUMNS");
    expect(source).toContain("SUBMITTED_PROJECT_COLUMNS");
    expect(source).toContain("SUBMITTED_CLIENT_COLUMNS");
    expect(source).toContain(".select(SUBMITTED_PROJECT_APPLICATION_COLUMNS.join");
    expect(source).toContain(".select(SUBMITTED_GENERAL_APPLICATION_COLUMNS.join");
    expect(source).toContain(".select(SUBMITTED_PROJECT_COLUMNS.join");
    expect(source).toContain(".select(SUBMITTED_CLIENT_COLUMNS.join");
  });

  it("SEC-SUBMITTED-APPLICATIONS-PROJECTION-047: excludes unrelated administrative and billing metadata", () => {
    expect(source).toContain('"passion_for_project"');
    expect(source).toContain('"client_project_knowledge"');
    expect(source).toContain('"logo_url"');
    expect(source).not.toContain('"internal_notes"');
    expect(source).not.toContain('"billing"');
    expect(source).not.toContain('"stripe"');
    expect(source).not.toContain('"ssn"');
  });
});

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ProjectFormPage OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "ProjectFormPage.tsx"), "utf8");

  it("SEC-PROJECT-FORM-PROJECTION-044: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-PROJECT-FORM-PROJECTION-044: uses explicit allowlists for project and client reads", () => {
    expect(source).toContain("PROJECT_FORM_PROJECT_COLUMNS");
    expect(source).toContain("PROJECT_FORM_CLIENT_COLUMNS");
    expect(source).toContain(".select(PROJECT_FORM_PROJECT_COLUMNS)");
    expect(source).toContain(".select(PROJECT_FORM_CLIENT_COLUMNS)");
  });

  it("SEC-PROJECT-FORM-PROJECTION-044: bounds project/client fields to UI-required data", () => {
    expect(source).toContain('"friendly_name"');
    expect(source).toContain('"discord_role_id"');
    expect(source).toContain('"project_summary"');
    expect(source).not.toContain("internal_notes");
    expect(source).not.toContain("private_metadata");
    expect(source).not.toContain("billing");
  });
});
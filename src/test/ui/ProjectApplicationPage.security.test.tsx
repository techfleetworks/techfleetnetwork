import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ProjectApplicationPage OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "ProjectApplicationPage.tsx"), "utf8");

  it("SEC-PROJECT-APPLICATION-PROJECTION-048: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-PROJECT-APPLICATION-PROJECTION-048: uses allowlists for application flow reads", () => {
    expect(source).toContain("PROJECT_APPLICATION_PROJECT_COLUMNS");
    expect(source).toContain("PROJECT_APPLICATION_CLIENT_COLUMNS");
    expect(source).toContain("PROJECT_APPLICATION_GENERAL_COLUMNS");
    expect(source).toContain("PROJECT_APPLICATION_PROFILE_COLUMNS");
    expect(source).toContain("PROJECT_APPLICATION_EXISTING_COLUMNS");
    expect(source).toContain(".select(PROJECT_APPLICATION_PROJECT_COLUMNS)");
    expect(source).toContain(".select(PROJECT_APPLICATION_CLIENT_COLUMNS)");
    expect(source).toContain(".select(PROJECT_APPLICATION_GENERAL_COLUMNS)");
    expect(source).toContain(".select(PROJECT_APPLICATION_PROFILE_COLUMNS)");
    expect(source).toContain(".select(PROJECT_APPLICATION_EXISTING_COLUMNS)");
  });

  it("SEC-PROJECT-APPLICATION-PROJECTION-048: bounds loaded fields to rendered form and notification data", () => {
    expect(source).toContain("team_hats_interest");
    expect(source).toContain("servant_leadership_definition");
    expect(source).toContain("discord_user_id");
    expect(source).not.toContain("private_metadata");
    expect(source).not.toContain("internal_notes");
    expect(source).not.toContain("billing");
    expect(source).not.toContain("ip_address");
  });
});

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ProjectApplicationStatusPage OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "ProjectApplicationStatusPage.tsx"), "utf8");

  it("SEC-APPLICATION-STATUS-PROJECTION-045: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-APPLICATION-STATUS-PROJECTION-045: uses allowlists for member status reads", () => {
    expect(source).toContain("APPLICATION_STATUS_APPLICATION_COLUMNS");
    expect(source).toContain("APPLICATION_STATUS_PROFILE_COLUMNS");
    expect(source).toContain("APPLICATION_STATUS_GENERAL_APPLICATION_COLUMNS");
    expect(source).toContain("APPLICATION_STATUS_NOTIFICATION_COLUMNS");
    expect(source).toContain(".select(APPLICATION_STATUS_APPLICATION_COLUMNS)");
    expect(source).toContain(".select(APPLICATION_STATUS_PROFILE_COLUMNS)");
    expect(source).toContain(".select(APPLICATION_STATUS_GENERAL_APPLICATION_COLUMNS)");
    expect(source).toContain(".select(APPLICATION_STATUS_NOTIFICATION_COLUMNS)");
  });

  it("SEC-APPLICATION-STATUS-PROJECTION-045: bounds status review fields to rendered data", () => {
    expect(source).toContain('"applicant_status"');
    expect(source).toContain('"team_hats_interest"');
    expect(source).toContain('"professional_goals"');
    expect(source).toContain('"body_html"');
    expect(source).not.toContain("private_metadata");
    expect(source).not.toContain("admin_notes");
    expect(source).not.toContain("ip_address");
  });
});
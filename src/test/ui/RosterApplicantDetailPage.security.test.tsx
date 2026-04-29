import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("RosterApplicantDetailPage OWASP A02/performance hardening", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "RosterApplicantDetailPage.tsx"), "utf8");

  it("SEC-ROSTER-APPLICANT-PROJECTION-040: avoids wildcard data projection", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain('.select("*, clients(name)")');
  });

  it("SEC-ROSTER-APPLICANT-PROJECTION-040: uses explicit allowlisted projections for applicant review data", () => {
    expect(source).toContain("PROJECT_APPLICATION_DETAIL_COLUMNS");
    expect(source).toContain("PROJECT_DETAIL_COLUMNS");
    expect(source).toContain("PROFILE_DETAIL_COLUMNS");
    expect(source).toContain("GENERAL_APPLICATION_DETAIL_COLUMNS");
    expect(source).toContain(".select(PROJECT_APPLICATION_DETAIL_COLUMNS)");
    expect(source).toContain(".select(PROJECT_DETAIL_COLUMNS)");
    expect(source).toContain(".select(PROFILE_DETAIL_COLUMNS)");
    expect(source).toContain(".select(GENERAL_APPLICATION_DETAIL_COLUMNS)");
  });

  it("SEC-ROSTER-APPLICANT-PROJECTION-040: includes only UI-required sensitive profile fields", () => {
    expect(source).toContain('"email"');
    expect(source).toContain('"discord_user_id"');
    expect(source).not.toContain('phone');
    expect(source).not.toContain('address');
  });
});

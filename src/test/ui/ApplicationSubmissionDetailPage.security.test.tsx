import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ApplicationSubmissionDetailPage OWASP A02/performance hardening", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "ApplicationSubmissionDetailPage.tsx"), "utf8");

  it("SEC-APPLICATION-SUBMISSION-PROJECTION-041: avoids wildcard data projection", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-APPLICATION-SUBMISSION-PROJECTION-041: uses explicit allowlisted projections for each data source", () => {
    expect(source).toContain("SUBMISSION_PROJECT_APPLICATION_COLUMNS");
    expect(source).toContain("SUBMISSION_PROJECT_COLUMNS");
    expect(source).toContain("SUBMISSION_CLIENT_COLUMNS");
    expect(source).toContain("SUBMISSION_PROFILE_COLUMNS");
    expect(source).toContain("SUBMISSION_GENERAL_APPLICATION_COLUMNS");
    expect(source).toContain(".select(SUBMISSION_PROJECT_APPLICATION_COLUMNS)");
    expect(source).toContain(".select(SUBMISSION_PROJECT_COLUMNS)");
    expect(source).toContain(".select(SUBMISSION_CLIENT_COLUMNS)");
    expect(source).toContain(".select(SUBMISSION_PROFILE_COLUMNS)");
    expect(source).toContain(".select(SUBMISSION_GENERAL_APPLICATION_COLUMNS)");
  });

  it("SEC-APPLICATION-SUBMISSION-PROJECTION-041: keeps applicant PII bounded to rendered fields", () => {
    expect(source).toContain('"email"');
    expect(source).toContain('"country"');
    expect(source).not.toContain('phone');
    expect(source).not.toContain('address');
    expect(source).not.toContain('discord_user_id');
  });
});

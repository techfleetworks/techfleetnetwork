import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("admin roster OWASP A02 data minimization", () => {
  const rosterSource = fs.readFileSync(path.join(process.cwd(), "src", "pages", "AdminRosterPage.tsx"), "utf8");
  const detailSource = fs.readFileSync(path.join(process.cwd(), "src", "pages", "RosterProjectDetailPage.tsx"), "utf8");
  const testSource = fs.readFileSync(path.join(process.cwd(), "src", "test", "ui", "AdminProjects.test.tsx"), "utf8");
  const combinedSource = `${rosterSource}\n${detailSource}\n${testSource}`;

  it("SEC-ADMIN-ROSTER-PROJECTION-055: avoids wildcard and implicit projections", () => {
    expect(combinedSource).not.toContain('.select("*")');
    expect(combinedSource).not.toContain(".select('*')");
    expect(combinedSource).not.toMatch(/\.select\(\s*\)/);
  });

  it("SEC-ADMIN-ROSTER-PROJECTION-055: uses roster allowlists for project and count reads", () => {
    expect(rosterSource).toContain("ADMIN_ROSTER_PROJECT_COLUMNS");
    expect(rosterSource).toContain("ADMIN_ROSTER_APPLICATION_COUNT_COLUMNS");
    expect(rosterSource).toContain(".select(ADMIN_ROSTER_PROJECT_COLUMNS)");
    expect(rosterSource).toContain(".select(ADMIN_ROSTER_APPLICATION_COUNT_COLUMNS)");
  });

  it("SEC-ADMIN-ROSTER-PROJECTION-055: bounds detail reads to displayed project fields", () => {
    expect(detailSource).toContain("ROSTER_PROJECT_DETAIL_COLUMNS");
    expect(detailSource).toContain(".select(ROSTER_PROJECT_DETAIL_COLUMNS)");
    expect(combinedSource).not.toContain("private_metadata");
    expect(combinedSource).not.toContain("billing");
    expect(combinedSource).not.toContain("internal_notes");
  });
});

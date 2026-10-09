// Smoke coverage for ADR-0065 (project-application resume integrity), per-file.
//
// public.projects is COLUMN-SCOPED for `authenticated` (ADR-0056): a direct `select('*')` expands to the
// four operational columns this role cannot read and fails Postgres 42501 / HTTP 403 — which shipped as
// "Project not found" on the application-resume page. This guards, file by file, that every authenticated
// reader of projects stays on explicit non-sensitive columns (complementing the repo-wide arch-gate rule
// with defense-in-depth on exactly the surfaces the fix touched), that the apply page keeps is_shipathon
// so the Shipathon question flow (ADR-0055) stays correct, and that the two "applied?" surfaces derive
// submission state from the single owner rather than row existence. Reading each source by its full path
// also gives these modules bdd-gate coverage (D-13).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// `from("projects").select("*"` — single-line or multiline chain (same shape the arch-gate rule bans).
const PROJECTS_SELECT_STAR = /from\(\s*['"]projects['"]\s*\)\s*\.select\(\s*['"]\*/;

// Every file migrated off select("*") for public.projects (authenticated client).
const PROJECT_READERS = [
  "src/pages/ProjectApplicationPage.tsx",
  "src/pages/ProjectOpeningDetailPage.tsx",
  "src/pages/MyProjectApplicationsPage.tsx",
  "src/pages/ApplicationSubmissionDetailPage.tsx",
  "src/pages/ProjectFormPage.tsx",
  "src/pages/RosterApplicantDetailPage.tsx",
  "src/components/SubmittedApplicationsTab.tsx",
  "src/components/clients/ProjectsTab.tsx",
];

describe("projects column-scoped reads (ADR-0065 smoke)", () => {
  it.each(PROJECT_READERS)("%s never selects('*') on public.projects", (file) => {
    expect(read(file)).not.toMatch(PROJECTS_SELECT_STAR);
  });

  it("APP-RESUME-001: the apply page selects is_shipathon (keeps the Shipathon flow, ADR-0055)", () => {
    expect(read("src/pages/ProjectApplicationPage.tsx")).toMatch(/is_shipathon/);
  });

  it("APP-RESUME-002: RosterApplicantDetailPage sources operational links via the RPC, not a direct select", () => {
    expect(read("src/pages/RosterApplicantDetailPage.tsx")).toMatch(/get_project_internal_links/);
  });

  it("APP-RESUME-003: both applied-state surfaces derive from the single owner, not row existence", () => {
    const detail = read("src/pages/ProjectOpeningDetailPage.tsx");
    const openings = read("src/pages/ProjectOpeningsPage.tsx");
    expect(detail).toMatch(/getProjectApplicationSubmissionState/);
    expect(openings).toMatch(/getProjectApplicationSubmissionState/);
    // the row-existence bug (a draft shown as submitted) must not return
    expect(detail).not.toMatch(/hasApplied\s*=\s*!!/);
    expect(openings).not.toMatch(/userApplied:\s*appliedProjectIds\.has/);
  });
});

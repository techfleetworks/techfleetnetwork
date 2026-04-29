import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Clients and Projects admin tabs OWASP A02 data minimization", () => {
  const clientsSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "clients", "ClientsTab.tsx"), "utf8");
  const projectsSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "clients", "ProjectsTab.tsx"), "utf8");
  const combinedSource = `${clientsSource}\n${projectsSource}`;

  it("SEC-CLIENTS-PROJECTS-TABS-PROJECTION-049: avoids wildcard projections", () => {
    expect(combinedSource).not.toContain('.select("*")');
    expect(combinedSource).not.toContain(".select('*')");
  });

  it("SEC-CLIENTS-PROJECTS-TABS-PROJECTION-049: uses allowlists for admin client and project reads", () => {
    expect(clientsSource).toContain("CLIENTS_TAB_COLUMNS");
    expect(projectsSource).toContain("PROJECTS_TAB_CLIENT_COLUMNS");
    expect(projectsSource).toContain("PROJECTS_TAB_PROJECT_COLUMNS");
    expect(clientsSource).toContain(".select(CLIENTS_TAB_COLUMNS)");
    expect(projectsSource).toContain(".select(PROJECTS_TAB_CLIENT_COLUMNS)");
    expect(projectsSource).toContain(".select(PROJECTS_TAB_PROJECT_COLUMNS)");
  });

  it("SEC-CLIENTS-PROJECTS-TABS-PROJECTION-049: excludes unrelated billing and private metadata", () => {
    expect(combinedSource).toContain("primary_contact");
    expect(combinedSource).toContain("current_phase_milestones");
    expect(combinedSource).toContain("logo_url");
    expect(combinedSource).not.toContain("billing");
    expect(combinedSource).not.toContain("private_metadata");
    expect(combinedSource).not.toContain("internal_notes");
    expect(combinedSource).not.toContain("secret");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";

// bdd-gate coverage: src/pages/ClassAdminPage.tsx

/**
 * ClassAdminPage (ADR-0063) — the tabbed shell. Verifies the heading, the two section tabs, and that
 * it delegates to the role-correct list (admin sees the "admin" Classes list, a teacher the "mine"
 * list). The list components are stubbed; their own behavior is tested separately.
 */
const adminState = { isAdmin: false };
vi.mock("@/hooks/use-admin", () => ({ useAdmin: () => adminState }));
vi.mock("@/hooks/use-classes", () => ({
  useAllClasses: () => ({ data: [], isLoading: false }),
  useMyClasses: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/use-cohorts", () => ({
  useCohortsForScope: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/components/classes/ClassList", () => ({
  ClassList: ({ mode }: { mode: string }) => <div>CLASSLIST:{mode}</div>,
}));
vi.mock("@/components/classes/CohortList", () => ({
  CohortList: () => <div>COHORTLIST</div>,
}));

import ClassAdminPage from "@/pages/ClassAdminPage";

describe("ClassAdminPage", () => {
  beforeEach(() => {
    adminState.isAdmin = false;
  });
  afterEach(() => cleanup());

  it("renders the 'Class Admin' heading and both section tabs", () => {
    renderWithRouter(<ClassAdminPage tab="classes" />);
    expect(screen.getByRole("heading", { name: "Class Admin" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Classes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cohorts" })).toBeInTheDocument();
  });

  it("shows the admin classes list for an admin", () => {
    adminState.isAdmin = true;
    renderWithRouter(<ClassAdminPage tab="classes" />);
    expect(screen.getByText("CLASSLIST:admin")).toBeInTheDocument();
  });

  it("shows the teacher's own classes list for a non-admin teacher", () => {
    adminState.isAdmin = false;
    renderWithRouter(<ClassAdminPage tab="classes" />);
    expect(screen.getByText("CLASSLIST:mine")).toBeInTheDocument();
  });

  it("shows the cohorts list on the cohorts tab", () => {
    renderWithRouter(<ClassAdminPage tab="cohorts" />);
    expect(screen.getByText("COHORTLIST")).toBeInTheDocument();
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import type { ClassRow } from "@/services/class.service";
import type { CohortWithClass } from "@/services/cohort.service";

// bdd-gate coverage: src/components/classes/CohortList.tsx

vi.mock("@/components/AgGrid", () => ({
  ThemedAgGrid: ({ rowData }: { rowData: unknown[] }) => (
    <div data-testid="themed-ag-grid">grid:{rowData.length}</div>
  ),
}));
vi.mock("@/hooks/use-cohorts", () => ({
  useDeleteCohort: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CohortList } from "@/components/classes/CohortList";

const CLASSES = [
  { id: "cl1", title: "Product Discovery", track: "basic_training" },
] as unknown as ClassRow[];

const cohort: CohortWithClass = {
  id: "c1",
  class_id: "cl1",
  label: "Fall 2026",
  start_date: "2026-09-15",
  end_date: "2026-11-07",
  timezone: "America/New_York",
  registration_url: "https://example.com",
  meeting_url: null,
  capacity: null,
  status: "published",
  registration_status: "live",
  schedule: "",
  submitted_at: null,
  published_at: null,
  archived_at: null,
  archive_reason: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  class: {
    id: "cl1",
    title: "Product Discovery",
    track: "basic_training",
    status: "published",
    owner_user_id: "u1",
  },
};

describe("CohortList", () => {
  afterEach(() => cleanup());

  it("offers the registration-status filters (Coming Soon → Register Now → Live → Finished)", () => {
    renderWithRouter(<CohortList cohorts={[cohort]} isLoading={false} classes={CLASSES} />);
    expect(screen.getByRole("tab", { name: /coming soon/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /register now/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /live/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /finished/i })).toBeInTheDocument();
  });

  it("renders the cohorts into the grid", () => {
    renderWithRouter(<CohortList cohorts={[cohort]} isLoading={false} classes={CLASSES} />);
    expect(screen.getByTestId("themed-ag-grid")).toHaveTextContent("grid:1");
  });

  it("shows an empty state when there are no cohorts", () => {
    renderWithRouter(<CohortList cohorts={[]} isLoading={false} classes={CLASSES} />);
    expect(screen.getByText(/no cohorts yet/i)).toBeInTheDocument();
  });

  it("'Add cohort' opens a class picker listing the available classes", () => {
    renderWithRouter(<CohortList cohorts={[cohort]} isLoading={false} classes={CLASSES} />);
    fireEvent.click(screen.getByRole("button", { name: /add cohort/i }));
    expect(screen.getByText("Product Discovery")).toBeInTheDocument();
  });
});

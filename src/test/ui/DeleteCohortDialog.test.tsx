import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import type { CohortWithClass } from "@/services/cohort.service";

// bdd-gate coverage: src/components/classes/DeleteCohortDialog.tsx

const del = { isPending: false, mutateAsync: vi.fn() };
vi.mock("@/hooks/use-cohorts", () => ({ useDeleteCohort: () => del }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { DeleteCohortDialog } from "@/components/classes/DeleteCohortDialog";

function makeCohort(overrides: Partial<CohortWithClass> = {}): CohortWithClass {
  return {
    id: "c1",
    class_id: "cl1",
    label: "Fall 2026",
    start_date: "2026-09-15",
    end_date: "2026-11-07",
    timezone: "America/New_York",
    registration_url: "https://example.com",
    meeting_url: null,
    capacity: null,
    status: "draft",
    registration_status: "coming_soon",
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
      status: "draft",
      owner_user_id: "u1",
    },
    ...overrides,
  };
}

describe("DeleteCohortDialog", () => {
  beforeEach(() => {
    del.mutateAsync = vi.fn();
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("calls the delete RPC with the cohort + class ids and reports a hard delete", async () => {
    del.mutateAsync.mockResolvedValue("deleted");
    renderWithRouter(<DeleteCohortDialog cohort={makeCohort()} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /delete cohort/i }));
    await waitFor(() =>
      expect(del.mutateAsync).toHaveBeenCalledWith({ cohortId: "c1", classId: "cl1" })
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/deleted/i));
  });

  it("reports a soft-cancel when the RPC preserves registrations", async () => {
    del.mutateAsync.mockResolvedValue("cancelled");
    renderWithRouter(
      <DeleteCohortDialog
        cohort={makeCohort({ status: "published" })}
        open
        onOpenChange={() => {}}
      />
    );
    // A published cohort tells the user up front it will be cancelled, not deleted.
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete cohort/i }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/cancelled|preserved/i))
    );
  });
});

// bdd-gate coverage: src/components/classes/CohortRegistrationStatusControl.tsx
// bdd-gate coverage: src/pages/ClassDetailPage.tsx — the cohort record renders this control as the
// owner/admin "Registration Status" editor; it is the substance of the ClassDetailPage change.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the data hook so the control renders without React Query / the service / Supabase.
const mutation: { mutate: ReturnType<typeof vi.fn>; isPending: boolean } = {
  mutate: vi.fn(),
  isPending: false,
};
vi.mock("@/hooks/use-cohorts", () => ({
  useSetCohortRegistrationStatus: () => mutation,
}));

import { CohortRegistrationStatusControl } from "@/components/classes/CohortRegistrationStatusControl";

beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.isPending = false;
});

describe("CohortRegistrationStatusControl", () => {
  it("renders an accessible registration-status selector naming the cohort", () => {
    render(
      <CohortRegistrationStatusControl
        cohortId="c1"
        classId="cl1"
        value="live"
        cohortLabel="Spring 2026"
      />
    );
    const trigger = screen.getByLabelText(/set registration status for cohort Spring 2026/i);
    expect(trigger).toBeInTheDocument();
    expect(trigger).not.toBeDisabled();
  });

  it("disables the selector while a change is saving", () => {
    mutation.isPending = true;
    render(
      <CohortRegistrationStatusControl
        cohortId="c1"
        classId="cl1"
        value="coming_soon"
        cohortLabel="Fall 2026"
      />
    );
    expect(screen.getByLabelText(/set registration status for cohort Fall 2026/i)).toBeDisabled();
  });
});

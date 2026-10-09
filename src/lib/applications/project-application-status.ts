/**
 * Single source of truth for a member's SUBMISSION state on one project application.
 *
 * A `project_applications` row is created (and autosaved) the moment an applicant STARTS — so the
 * mere existence of a row means "started", NOT "submitted". Only `status === 'completed'` means the
 * application was actually submitted. This mirrors the signals already used everywhere else:
 *   - ProjectApplicationPage `isCompleted = existingApp?.status === 'completed'`
 *   - the public-project-detail "Applications Submitted" count, which filters `status = 'completed'`
 *   - ApplicationStatusBadge, which renders draft → "In Progress" vs completed → "Submitted"
 *
 * Deriving "have they applied?" from row existence (`!!row`) is the defect this closes (ADR-0065): an
 * abandoned draft was shown as "you've already submitted / Edit Application", and the "Resume" path was
 * hidden. Every surface that decides Apply / Resume / Edit (or an "Applied" label) MUST derive it from
 * this function so a draft can never be reported as submitted.
 *
 * Fail-safe by construction: only the exact string 'completed' counts as submitted. Any other value on
 * an existing row — a draft, a missing/null status, or an unknown/legacy status — resolves to 'draft',
 * so the UI never falsely tells an applicant they finished.
 */
export type ProjectApplicationSubmissionState = "none" | "draft" | "completed";

/** Only the field this rule depends on — keep it minimal so any row shape can be passed. */
export interface ProjectApplicationStatusInput {
  status?: string | null;
}

export function getProjectApplicationSubmissionState(
  application: ProjectApplicationStatusInput | null | undefined
): ProjectApplicationSubmissionState {
  if (!application) return "none";
  return application.status === "completed" ? "completed" : "draft";
}

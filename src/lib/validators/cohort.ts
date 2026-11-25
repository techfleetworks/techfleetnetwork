import { z } from "zod";
import {
  safeHtmlSchema,
  safeRequiredTextSchema,
  safeShortTextSchema,
  safeUrlSchema,
} from "@/lib/validators/shared-input";

export const COHORT_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "archived",
  "cancelled",
] as const;
export type CohortStatus = (typeof COHORT_STATUSES)[number];

/**
 * Cohort REGISTRATION status — the learner-facing lifecycle of a cohort's run, distinct from
 * CohortStatus (the draft->pending_review->published->archived PUBLISH/approval workflow). Owned by
 * the DB column cohorts.registration_status; written only through set_cohort_registration_status()
 * (owner-or-admin). Mirrors the {value,label} shape of PROJECT_STATUSES so the UI renders labels
 * without a second map.
 */
export const COHORT_REGISTRATION_STATUSES = [
  { value: "coming_soon", label: "Coming Soon" },
  { value: "register_now", label: "Register Now" },
  { value: "live", label: "Live" },
  { value: "finished", label: "Finished" },
] as const;
export type CohortRegistrationStatus = (typeof COHORT_REGISTRATION_STATUSES)[number]["value"];

export function cohortRegistrationStatusLabel(status: CohortRegistrationStatus): string {
  return COHORT_REGISTRATION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** The register-OPEN registration states — the ones that mean "publicly open to register". */
export const REGISTRATION_OPEN_STATUSES = ["register_now", "live"] as const;

export function isRegistrationOpenStatus(status: CohortRegistrationStatus): boolean {
  return (REGISTRATION_OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * Can a cohort's registration be OPENED (set to register_now/live)? Only when the cohort would
 * actually show as open publicly: published AND its end date has not passed. This mirrors the DB
 * write guard in set_cohort_registration_status (migration 20261125150000) one-for-one — the DB is
 * the real enforcement (ADR 20261125-cohort-registration-open-invariant); the admin UI uses this to
 * disable the open options up front so the error never has to fire. Kept here so the UI rule and the
 * DB rule have one authored definition (the pgTAP suite proves the DB; a unit test proves this).
 */
export function canOpenRegistration(
  publishStatus: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  if (publishStatus !== "published") return false;
  if (!endDate) return false;
  // ISO YYYY-MM-DD compares lexically; "today or later" is still open (matches `end_date >= current_date`).
  return endDate.slice(0, 10) >= new Date().toISOString().slice(0, 10);
}

const dateSchema = z
  .string()
  .min(1, "Date is required")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const cohortFormSchema = z
  .object({
    label: safeRequiredTextSchema("Cohort label", 80),
    start_date: dateSchema,
    end_date: dateSchema,
    registration_url: z
      .string()
      .trim()
      .min(1, "Registration URL is required")
      .max(500, "Registration URL must be under 500 characters")
      .refine((v) => /^https:\/\/.+/i.test(v), "Registration URL must start with https://"),
    meeting_url: safeUrlSchema("Meeting URL", 500).optional().default(""),
    timezone: safeShortTextSchema("Timezone", 80).default("America/New_York"),
    capacity: z
      .union([
        z.coerce.number().int().min(1).max(10_000),
        z.literal("").transform(() => null),
        z.null(),
      ])
      .optional()
      .nullable(),
    // New optional rich-text section (CLASS-EDIT-EXT-004).
    // Sanitized again at the DB layer by sanitize_cohorts_html trigger.
    schedule: safeHtmlSchema("Schedule of Classes", 50_000).default(""),
  })
  .refine((d) => Date.parse(d.end_date) >= Date.parse(d.start_date), {
    message: "End date must be on or after start date",
    path: ["end_date"],
  });

export type CohortFormValues = z.infer<typeof cohortFormSchema>;

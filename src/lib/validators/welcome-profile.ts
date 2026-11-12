import { z } from "zod";
import { safeShortTextSchema, safeUrlSchema } from "@/lib/validators/shared-input";

/**
 * Welcome Flow step (f) — Basic Information. Every field is OPTIONAL to advance
 * (P11 / FR-f1a): emptiness never blocks the flow; a field with a value is still
 * validated (a URL must be a URL). Keys are the EXISTING `profiles` snake_case
 * columns so the values pass straight to ProfileService.updateFields (AC-f1 — no new
 * column; "State" is not collected). `safeShortTextSchema` allows empty; `safeUrlSchema`
 * allows "" and normalizes scheme-less URLs to https.
 *
 * AC-f3: every field here must also be in the ProfileService allow-list, or updateFields
 * silently drops it — the two lists are kept in lockstep (welcome-profile.fields.test.ts).
 */
export const welcomeProfileSchema = z.object({
  first_name: safeShortTextSchema("First name", 100).default(""),
  last_name: safeShortTextSchema("Last name", 100).default(""),
  country: safeShortTextSchema("Country", 100).default(""),
  portfolio_url: safeUrlSchema("Portfolio URL", 500).default(""),
  linkedin_url: safeUrlSchema("LinkedIn URL", 500).default(""),
});

export type WelcomeProfileForm = z.infer<typeof welcomeProfileSchema>;

/** The ordered field set, so the UI and the allow-list parity test share one source. */
export const WELCOME_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "country",
  "portfolio_url",
  "linkedin_url",
] as const satisfies readonly (keyof WelcomeProfileForm)[];

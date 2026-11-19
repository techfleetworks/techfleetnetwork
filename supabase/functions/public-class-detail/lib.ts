// Pure, testable mapping for the public class-detail gateway. The §6 column
// allowlists now live in the shared visibility policy (_shared/public-visibility,
// A5) — this file only holds the output mappers, kept out of index.ts (Deno.serve)
// so the public contract can be unit-tested without a running server.
//
// Ticket 34c1a3bddce58092864bc1ac090fe335 §6.
import type { AuthState } from "../_shared/public-visibility.ts";

export interface RawCohort {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  registration_url: string;
  // Authed-only extras — present only when the gateway selected them (authState
  // "authenticated"); undefined for anon.
  status?: string;
  capacity?: number | null;
  timezone?: string;
}

export type PublicCohort = RawCohort;

/**
 * Map a cohort row to its public shape. Anon emits exactly the 5 §6 fields; a
 * signed-in member also gets status/capacity/timezone (the authed-only extras).
 * Explicitly re-emits only allowlisted keys, so no extra column can leak even if
 * the select widens.
 */
export function toPublicCohort(c: RawCohort, authState: AuthState): PublicCohort {
  const out: PublicCohort = {
    id: c.id,
    label: c.label,
    start_date: c.start_date,
    end_date: c.end_date,
    registration_url: c.registration_url,
  };
  if (authState === "authenticated") {
    out.status = c.status;
    out.capacity = c.capacity ?? null;
    out.timezone = c.timezone;
  }
  return out;
}

/** Drop owner_user_id and attach the derived instructor name. */
export function toPublicClass<T extends { owner_user_id?: string | null }>(
  cls: T,
  instructorName: string | null,
): Omit<T, "owner_user_id"> & { instructor_name: string | null } {
  const { owner_user_id: _ownerUserId, ...rest } = cls;
  return { ...rest, instructor_name: instructorName };
}

/** Build a display name from a profile row, preferring display_name. */
export function deriveInstructorName(
  prof:
    | { display_name?: string | null; first_name?: string | null; last_name?: string | null }
    | null,
): string | null {
  if (!prof) return null;
  return (
    prof.display_name ||
    [prof.first_name, prof.last_name].filter(Boolean).join(" ") ||
    null
  );
}

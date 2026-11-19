// Deno tests for the public class-detail mappers. Run:
//   deno test supabase/functions/public-class-detail/lib.test.ts
//
// @security — proves owner_user_id is dropped, and that anon cohorts never carry
// the authed-only extras (status/capacity/timezone) while authed cohorts do.
// (Field-allowlist coverage now lives in _shared/public-visibility.test.ts.)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveInstructorName, toPublicClass, toPublicCohort } from "./lib.ts";

// --- toPublicClass --------------------------------------------------------

Deno.test("toPublicClass drops owner_user_id and attaches instructor_name", () => {
  const out = toPublicClass(
    { id: "c1", title: "Intro", owner_user_id: "owner-uuid" },
    "Ada Lovelace",
  );
  assert(!("owner_user_id" in out));
  assertEquals(out.instructor_name, "Ada Lovelace");
  assertEquals(out.title, "Intro");
});

Deno.test("toPublicClass tolerates a null instructor name", () => {
  const out = toPublicClass({ id: "c1", owner_user_id: "owner-uuid" }, null);
  assertEquals(out.instructor_name, null);
  assert(!("owner_user_id" in out));
});

// --- toPublicCohort (auth-aware) ------------------------------------------

const rawCohort = {
  id: "co1",
  label: "Spring 2026",
  start_date: "2026-04-01",
  end_date: "2026-06-01",
  registration_url: "https://gum.co/x",
  // extras that must only surface for authed callers
  status: "published",
  capacity: 20,
  timezone: "America/New_York",
};

Deno.test("anon cohort exposes ONLY the 5 §6 fields — no status/capacity/timezone", () => {
  const out = toPublicCohort(rawCohort, "anon");
  assertEquals(Object.keys(out).sort(), [
    "end_date",
    "id",
    "label",
    "registration_url",
    "start_date",
  ]);
});

Deno.test("authed cohort adds status/capacity/timezone", () => {
  const out = toPublicCohort(rawCohort, "authenticated");
  assertEquals(out.status, "published");
  assertEquals(out.capacity, 20);
  assertEquals(out.timezone, "America/New_York");
  // still never leaks non-allowlisted plumbing
  assert(!("class_id" in out) && !("meeting_url" in out) && !("schedule" in out));
});

// --- deriveInstructorName -------------------------------------------------

Deno.test("deriveInstructorName prefers display_name, falls back to first+last, else null", () => {
  assertEquals(
    deriveInstructorName({ display_name: "Grace H.", first_name: "Grace", last_name: "Hopper" }),
    "Grace H.",
  );
  assertEquals(
    deriveInstructorName({ display_name: null, first_name: "Grace", last_name: "Hopper" }),
    "Grace Hopper",
  );
  assertEquals(deriveInstructorName({ display_name: null, first_name: null, last_name: null }), null);
  assertEquals(deriveInstructorName(null), null);
});

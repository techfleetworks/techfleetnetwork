// Deno tests for the public visibility Strategy (public-access A5). Run:
//   deno test supabase/functions/_shared/public-visibility.test.ts
//
// @security — proves anon never receives the authed-only operational fields, that
// true secrets/PII (primary_contact, cohort.meeting_url) are in NEITHER state, and
// that auth-state resolution fails safe to "anon" for any non-verified result.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authedOnlyFields,
  authStateFromUserResult,
  clientCardFields,
  fieldsFor,
  projectCardFields,
  type PublicResource,
} from "./public-visibility.ts";

// Exact field membership (NOT substring — "phase" must not match "current_phase_milestones").
function fieldSet(resource: PublicResource, state: "anon" | "authenticated"): Set<string> {
  return new Set(fieldsFor(resource, state).split(",").map((s) => s.trim()));
}

Deno.test("project: anon hides phase/requires_interview; authed reveals them", () => {
  const anon = fieldSet("project", "anon");
  assert(!anon.has("phase"), "anon must not get project.phase");
  assert(!anon.has("requires_interview"), "anon must not get requires_interview");
  assert(anon.has("current_phase_milestones"), "anon still gets the public milestones field");
  const authed = fieldSet("project", "authenticated");
  assert(authed.has("phase") && authed.has("requires_interview"));
});

Deno.test("client: anon hides status/kind; authed reveals them; primary_contact in NEITHER", () => {
  const anon = fieldSet("client", "anon");
  const authed = fieldSet("client", "authenticated");
  assert(!anon.has("status") && !anon.has("kind"));
  assert(authed.has("status") && authed.has("kind"));
  assert(!anon.has("primary_contact"), "primary_contact (PII) never anon");
  assert(!authed.has("primary_contact"), "primary_contact (PII) never authed-public either");
});

Deno.test("cohort: anon hides status/capacity/timezone; authed reveals them; meeting_url in NEITHER", () => {
  const anon = fieldSet("cohort", "anon");
  const authed = fieldSet("cohort", "authenticated");
  for (const f of ["status", "capacity", "timezone"]) {
    assert(!anon.has(f), `anon cohort must not include ${f}`);
    assert(authed.has(f), `authed cohort should include ${f}`);
  }
  assert(!anon.has("meeting_url") && !authed.has("meeting_url"), "meeting_url is enrolled-only");
});

Deno.test("class: no authed extras, and hidden fields are in neither state", () => {
  const anon = fieldSet("class", "anon");
  assertEquals(fieldsFor("class", "anon"), fieldsFor("class", "authenticated")); // no additions
  for (const f of ["why_take", "audiences", "reading_assignments", "class_expectations"]) {
    assert(!anon.has(f), `class must never expose ${f}`);
  }
});

Deno.test("authedOnlyFields lists exactly the extras per resource", () => {
  assertEquals(authedOnlyFields("project"), ["phase", "requires_interview"]);
  assertEquals(authedOnlyFields("client"), ["status", "kind"]);
  assertEquals(authedOnlyFields("cohort"), ["status", "capacity", "timezone"]);
  assertEquals(authedOnlyFields("class"), []);
});

// --- card variants: single-sourced, no drift (@security) ------------------

Deno.test("card variants: anon excludes authed extras; authed adds them; extras ⊆ authedOnlyFields", () => {
  // anon card excludes the authed-only fields
  const projAnon = new Set(projectCardFields("anon").split(",").map((s) => s.trim()));
  assert(!projAnon.has("phase"), "anon project card must not include phase");
  const cliAnon = clientCardFields("anon");
  assert(!cliAnon.includes("kind"), "anon client card must not include kind");

  // authed card adds them
  assert(projectCardFields("authenticated").includes("phase"));
  assert(clientCardFields("authenticated").includes("kind"));

  // DRIFT GUARD: a card's authed extra must remain an authed-only field in the
  // policy. If §6 later drops phase/kind from the authed set, this fails CI.
  assert(authedOnlyFields("project").includes("phase"), "card uses phase; policy must keep it authed-only");
  assert(authedOnlyFields("client").includes("kind"), "card uses kind; policy must keep it authed-only");
});

// --- fail-safe auth-state resolution (@security) --------------------------

Deno.test("authStateFromUserResult widens ONLY for a verified user", () => {
  assertEquals(authStateFromUserResult({ data: { user: { id: "u1" } }, error: null }), "authenticated");
  assertEquals(authStateFromUserResult({ data: { user: null }, error: null }), "anon");
  assertEquals(authStateFromUserResult({ data: null, error: { message: "expired" } }), "anon");
  assertEquals(authStateFromUserResult({ data: { user: { id: "u1" } }, error: { message: "x" } }), "anon");
  assertEquals(authStateFromUserResult(null), "anon");
  assertEquals(authStateFromUserResult(undefined), "anon");
});

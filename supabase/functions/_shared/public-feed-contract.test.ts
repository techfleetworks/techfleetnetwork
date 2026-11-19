// Public feed CONTRACT + data-exposure CANARY (public-access A7). Run:
//   deno test supabase/functions/_shared/public-feed-contract.test.ts
//
// Two CI tripwires on the shared visibility policy, complementing the per-select
// allowlist guard (scripts/ci/check-public-field-allowlist.mjs):
//   1. Contract: the ANON select set is frozen in public-feed-contract.v1.json.
//      Changing public-visibility.ts ANON_FIELDS without bumping the fixture fails
//      CI — so the public contract can never change by accident (@release-safety).
//   2. Canary: a denylist of fields that must NEVER reach anon (and, for secrets/
//      PII, never reach any public caller). If one ever lands in a public set the
//      canary goes red (@security).
//
// Contract canary for the public-feed gateways that select through this policy:
//   supabase/functions/public-classes/index.ts, supabase/functions/public-courses/index.ts,
//   supabase/functions/public-class-detail/index.ts.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fieldsFor, type PublicResource } from "./public-visibility.ts";
import contract from "./public-feed-contract.v1.json" with { type: "json" };

const RESOURCES: PublicResource[] = ["class", "cohort", "project", "client", "course", "lesson"];
const anonFields = (r: PublicResource) => fieldsFor(r, "anon").split(",").map((s) => s.trim());

// --- 1. Frozen contract ---------------------------------------------------

Deno.test("v=1 contract: anon select set matches the frozen fixture exactly", () => {
  assertEquals(contract.version, 1);
  for (const r of RESOURCES) {
    assertEquals(
      anonFields(r),
      (contract.anon as Record<string, string[]>)[r],
      `anon ${r} select drifted from public-feed-contract.v1.json — bump the fixture if this change is intentional`,
    );
  }
});

// --- 2. Data-exposure canary ----------------------------------------------

// Secrets / PII / operational plumbing that must NOT reach ANY public caller.
const NEVER_PUBLIC: Record<string, string[]> = {
  client: ["primary_contact"],
  cohort: ["meeting_url", "schedule"],
  project: ["discord_role_id", "discord_role_name", "notion_repository_url", "client_intake_url"],
};

// Authed-only or hidden fields that must NOT reach ANON (they may reach a member).
const NEVER_ANON: Record<string, string[]> = {
  class: ["why_take", "audiences", "reading_assignments", "class_expectations"],
  cohort: ["status", "capacity", "timezone"],
  project: ["phase", "requires_interview"],
  client: ["status", "kind"],
};

Deno.test("canary: secrets/PII never appear in any public (anon or authed) set", () => {
  for (const r of RESOURCES) {
    const anon = new Set(anonFields(r));
    const authed = new Set(fieldsFor(r, "authenticated").split(",").map((s) => s.trim()));
    for (const f of NEVER_PUBLIC[r] ?? []) {
      assert(!anon.has(f), `${r}.${f} must never be in the anon set`);
      assert(!authed.has(f), `${r}.${f} must never be in the authed public set`);
    }
  }
});

Deno.test("canary: authed-only/hidden fields never leak into the ANON set", () => {
  for (const r of RESOURCES) {
    const anon = new Set(anonFields(r));
    for (const f of NEVER_ANON[r] ?? []) {
      assert(!anon.has(f), `${r}.${f} is authed-only/hidden — must not be in the anon set`);
    }
  }
});

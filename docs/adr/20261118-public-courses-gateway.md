# 20261118 — Public Core-course outline is served by a service-role gateway (A8)

- Status: Accepted
- Date: 2026-11-18
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), A8 / B10 / B12
- Related: 20261118-public-domain-bounded-contexts (governing), 20261116-public-class-gateway,
  20261116-public-visibility-auth-aware (A5), 20261117-revoke-anon-classes-cohorts (A6).
  Full design: `docs/public-access/ENTERPRISE-ARCHITECTURE.md`.

## Context and problem statement

The free Core courses (System A) live only in `course_catalog`/`lesson_catalog`, whose
RLS is `SELECT TO authenticated` — a logged-out visitor reads nothing. They are
UNLINKED to the paid `classes`/`cohorts` system (no `course_key` on `classes`, no
`class_id` on `course_catalog`, no class seeded per Core course), so the public class
gateway cannot serve them (ADR 20261118-public-domain-bounded-contexts). B10's
"Onboarding Courses" tab and B12 must show these courses to anon, as the same
structure a signed-in member sees (`use-course-catalog-prep`). We need a public read
path that cannot leak and cannot drift from the §6 discipline the other gateways use.

## Decision

Serve the Core-course outline through a dedicated **service-role Gateway** edge
function, `public-courses`, mirroring the hardened `public-class-detail` /
`public-classes` pattern:

- **Service-role admin client**, not the anon key. anon has zero table privileges
  after the A8 REVOKE (`20261118000000_revoke_anon_course_lesson_catalog.sql`), so the
  gateway is the only anon read path — a column added to either table can never leak to
  anon via a raw `select=*`.
- **Explicit §6 column allowlist, single-sourced** from `public-visibility.ts`
  (`ANON_FIELDS.course` / `.lesson`), validated per-select by the A7 CI guard
  (`check-public-field-allowlist.mjs`, now covering `course_catalog`/`lesson_catalog`)
  and frozen by the feed contract (`public-feed-contract.v1.json` + its test).
- **Outline only.** course_key + display_label + display_order + phase + tier, with the
  lesson structure embedded (lesson_id, course_key, display_order, required). No lesson
  bodies/titles/video — lesson copy lives client-side in `src/data/*`, keyed by these
  slugs.
- **Core tier only.** `active = true AND tier = 'core'` excludes onboarding, Connect
  Discord and Welcome. Free: no price/cohort/Gumroad/registration.
- **WAF + output DLP (scrubTree) + structured error auditing + edge cache**, as the
  other public gateways.

## Pattern-decision record

- **Problem / forces:** show authenticated-only, free course structure to anon, matching
  the logged-in view, without leaking; consistency with the existing public gateways;
  the surface will grow (B10/B12 consume it).
- **Forces evidence:** [observed, this session] `course_catalog`/`lesson_catalog` are
  `SELECT TO authenticated` (`20260520035523_*.sql`); lesson copy is client-side
  (`src/data/agile-course.ts`, `observer-course.ts`); the authenticated client reads the
  same columns via `use-course-catalog-prep.ts`.
- **Candidates considered:**
  - (a) **Service-role gateway + §6 allowlist** — chosen (matches A2/A3/A6; one place to
    audit; the A7 guard + feed contract enforce it).
  - (b) Add a `SELECT TO anon` RLS policy on the catalog tables — rejected: puts anon back
    on the DB, re-opens raw `select=*`, and a future PII column on the table would leak;
    inconsistent with the A6 lockdown.
  - (c) A SECURITY DEFINER RPC — rejected: a second serving shape; the owner chose edge
    functions for consistency + security (this session).
- **Decision:** (a) — Gateway + Strategy (the shared visibility allowlist), service-role.
- **Pros / cons accepted:** Pro — one serving shape, enforced allowlist, anon off the DB.
  Con — one more public projection to operate (config entry, manifest, allowlist/feed
  coverage), as the spec scoped.
- **Failure / rot prevented:** a raw `select=*` leak to anon; drift of the public column
  set; a non-core or inactive course reaching the public tab; lesson bodies escaping.
- **Security trade-off:** opens no new surface; keeps anon off the DB (REVOKE), outline is
  non-PII, DLP scrubs admin-authored text, WAF throttles enumeration.
- **Operational cost:** one edge function + its config/manifest entry + the extended A7
  guard and feed contract; no schema change to 767 members' progress tracking.
- **Verify correct application:** A7 guard self-test (incl. a discriminating A8 leak case),
  feed-contract freeze test, and pgTAP that anon has zero privilege on both tables while
  authenticated keeps SELECT; `@security` BDD in `public-courses.feature`.
  [proven for the allowlist/contract/lockdown via those tests; the behavioral end-to-end
  scenarios are `@status:planned` for Phase B.]
- **Real guarantee:** the public column set is single-sourced and CI-frozen, and anon is
  structurally off the tables; "structurally impossible to leak" means these *classes* of
  failure are closed by the REVOKE + the A7/feed gates, not that there are zero bugs.

## Consequences

- `public-courses` is additive (a new read projection, no schema change). It deploys with
  the public-access branch; the REVOKE applies only after it is live (ordering noted in the
  migration).
- B10/B12 consume this feed. The logged-in journey is unchanged (`authenticated` keeps its
  RLS SELECT).
- The A7 guard and feed contract now govern `course`/`lesson` too, so any future change to
  the public course columns is a deliberate, reviewed contract bump.

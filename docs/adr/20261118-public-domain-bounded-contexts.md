# 20261118 — Public domain is three bounded contexts; System A (courses) stays separate from System B (classes)

- Status: Accepted (corrected 2026-11-18 by skeptical audit — an earlier draft of
  this ADR wrongly concluded the Core courses are classes and A8 could be dropped;
  that reversed the spec's 2026-11-16 decision and is contradicted by the code).
- Date: 2026-11-18
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), A8 / B10 / B12 / B13
- Related: 20261116-public-class-gateway, 20261116-public-visibility-auth-aware (A5),
  20261117-revoke-anon-classes-cohorts (A6), 20261116-class-entitlement-ledger-projection (B13),
  20261116-gumroad-webhook-verify-by-callback. Full design: `docs/public-access/ENTERPRISE-ARCHITECTURE.md`.

## Context and problem statement

The public-access build reached A8 ("Core-course public projection") with an open
question the owner raised directly: classes and the course modules (the
`course_catalog`/`lesson_catalog` tables) "feel like two things for the same data
object," and the end-state is that a visitor (logged out or in) registers for the
same offering on Gumroad and sees the same data the same way. The question is
whether the two systems (`course_catalog` Core courses vs `classes`) are one
concept that should be served once, or two.

Evidence (this session, code-confirmed): the Core courses live only in
`course_catalog` (`SELECT TO authenticated`), which is **not linked to `classes`**
(no `course_key` on `classes`, no `class_id` on `course_catalog`, no class seeded
for any Core course slug). Registration lives only on `cohorts.registration_url`
(Gumroad). So the Core courses are not classes and are not registerable today, and
the class gateway cannot serve them. They are a genuinely separate system, not a
duplicate of classes — so serving them through their own A8 projection is correct,
not a data-ownership drift. The real question is only whether to **unify** them
into classes later (make them sellable), which is a deliberate future migration.

## Decision

Model the domain as **three bounded contexts**, each with a single owner of its
fact (`compliance`/`judge-arch` data-ownership), integrating with Gumroad through
one Anti-Corruption Layer:

1. **Catalog & Commerce** — the Class aggregate (`classes` + `cohorts`) is the
   one public, registerable offering. One public serving path (the gateway
   Strategy), one payload shape.
2. **Entitlement** — `gumroad_sales` ledger → `class_registrations` projection
   (ADR 20261116-class-entitlement-ledger-projection), the sole owner of "who
   paid / may access."
3. **Learning & Progress** — the **Course Modules** (`course_catalog` +
   `lesson_catalog`) + completions, internal and authenticated-only. **Not** a
   public registration object.

Therefore:

- **System A and System B are separate today, and A8 is required** (not dropped).
  The Course Modules are `SELECT TO authenticated` and are not classes (no
  `course_key` on `classes`, no `class_id` on `course_catalog`, no class seeded for
  any Core course), so the class gateway cannot serve them. A8 (a service-role /
  `SECURITY DEFINER` projection over `course_catalog`/`lesson_catalog`,
  outline-only) is the required public path. This upholds the spec's 2026-11-16
  decision: "NOT the full System A to B unification."
- **B10's "Onboarding Courses" tab is served by A8** (System A), not by the class
  gateway.
- **No System A → B unification. Core courses are free** (owner, 2026-11-18): no
  price, no cohort, no Gumroad, no registration. There is nothing to sell, so
  giving them a Class/Gumroad would be wrong. The two systems stay separate.
- For System B (classes), the public offering payload is auth-invariant for
  registration; authentication only adds operational context and pre-fills the
  entitlement claim. It never changes the registration view (`resolveAuthState`
  fails safe to anon).
- If Core training courses must become directly sellable, they become Classes
  (or `class.kind = 'core_course'`) via an expand/contract migration and their own
  ADR, flowing through the same Commerce + Entitlement contexts, never a parallel
  payment model.

## Pattern-decision record

- **Problem / forces:** the owner asked whether `course_catalog` Core courses and
  `classes` are "two things for the same data"; the end-state wants Core courses
  registerable on Gumroad, shown the same to anon and authed. System A (courses)
  and System B (classes) are distinct with their own consumers; paid classes are a
  growing revenue path; compliance duties (refund, dispute, GDPR) exist on the
  ledger.
- **Forces evidence:** [observed, this session, code-confirmed] `classes` has no
  `course_key`; `course_catalog` has no `class_id`; no class is seeded for any
  Core course slug; `course_catalog` is `SELECT TO authenticated`;
  `cohorts.registration_url` is the only registration field. So the two systems are
  unlinked and the class gateway cannot serve the Core courses.
- **Lifetime forces:** more offerings and more consumers of "who paid" (content
  gate, admin, stats, certificates) are certain; unifying System A into B later, on
  a running paid system, is a larger migration than doing it deliberately.
- **Cost of deferring the unification:** Core courses stay non-registerable; the
  "register for the same courses on Gumroad" goal waits. An accepted deferral, not
  drift — the two systems are genuinely different concepts.
- **Candidates considered:**
  - (a) **Keep System A and System B separate; A8 serves Core courses; unification
    is a separate, deferred decision** — chosen (upholds the spec's 2026-11-16
    decision; matches the code).
  - (b) Serve Core courses through the class gateway / drop A8 — **rejected: not
    possible.** Core courses are not classes and are unlinked, so the class gateway
    cannot serve them. (This is the error an earlier draft of this ADR made.)
  - (c) Unify System A into B (give every Core course a Class + Gumroad) —
    **rejected: Core courses are free** (owner, 2026-11-18). You do not put free
    content behind a payment system; there is nothing to sell.
- **Decision:** (a) — DDD bounded contexts; System B served by the class Gateway +
  Strategy (visibility); System A served by the A8 projection; Entitlement as
  CQRS/event-sourced Ledger + Anti-Corruption Layer (webhook); Cache-Aside (edge).
- **Pros / cons accepted:** Pro — matches the code and the spec; each system has one
  clear owner and serving path; no risky migration now. Con — Core courses are not
  registerable until the unification is decided and built.
- **Failure / rot prevented:** asserting a serving path the schema cannot support
  (the dropped-A8 error); copying commerce fields into the course catalog; a silent
  reversal of a recorded product decision.
- **Security trade-off:** opens no new surface; keeps anon off the DB (A6) and
  payment data in Gumroad; A8 is outline-only, service-role, under the §6
  discipline.
- **Operational cost:** A8 is one more public projection to build and operate
  (config entry, manifest, allowlist/feed-contract coverage), as the spec scoped.
- **Simpler alternative:** none that is correct — (b) is not buildable on the
  current schema.
- **Adopt safely:** A8 is additive (new read projection, no schema change). Any
  later unification (c) is expand/contract behind the class/entitlement seams,
  feature-flagged (`release-deployment-safety`).
- **Verify correct application:** extend the A7 allowlist guard + feed-contract to
  cover the A8 course projection; `@security` BDD that anon sees outline only (no
  lesson bodies). [not-assessed → observed when A8 lands with those tests.]
- **Real guarantee:** two systems, each with one owner and one serving path;
  invariants live in the REVOKE + the A7/feed-contract gates, not in the pattern.

## Consequences

- **A8 stands as scoped** (a `course_catalog`/`lesson_catalog` outline projection);
  B10/B12 consume it. The BUILD-PLAN rows revert to that (tracked in
  `BUILD-PLAN.md`).
- `course_catalog`/`lesson_catalog` keep their internal progress role unchanged; no
  schema change to 767 members' progress tracking.
- **System A → B unification is rejected**: Core courses are free (owner,
  2026-11-18), so there is nothing to sell and no reason to make them classes.
- **Terminology collision to resolve:** the spec uses "modules" for a class's
  curriculum outline (`class_module_sections`, the D-C "module outline"). A rename
  of `course_catalog` to "course modules" must not clash with that; pick a
  disambiguated term before applying it to the spec.
- Buildable Phase A work remains: A8 (as scoped), the project-side REVOKE (extend
  A6 to projects/clients), and the entitlement projection (B13).

# ADR 0053 — A CI guard locks the app's course definition to the DB's `lesson_catalog`

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: ADR-0050 (live-derived stats, single source of truth); `docs/architecture/stats-integrity-prd.md` §9 (the tracked follow-up this closes); ADR-0024 (prove invariants at their owning layer / pgTAP); ADR-0022 / ADR-0023 (CI guards must be tested and must discriminate); ADR-0026 (expand/contract); `decisions.md` §2.

## Context

"Which lessons make up a course" is defined in **two places** that must never disagree:

- **DB:** `public.lesson_catalog` — its `active AND required` rows per `course_key` (seeded in migration `20260520035523_*.sql`, `course_key`s in `public.course_catalog`). This drives the server-side live stats: `get_network_stats` counts `tier='core'` completions by joining `journey_progress` to these rows.
- **App:** TypeScript arrays — `ALL_AGILE_LESSON_IDS`, `ALL_PROJECT_TRAINING_LESSON_IDS`, `ALL_VOLUNTEER_LESSON_IDS`, `ALL_TEAMWORK_LESSON_IDS`, `ALL_DISCORD_LESSON_IDS`, `ALL_OBSERVER_LESSON_IDS` (`src/data/*`), `FIRST_STEPS_TASK_IDS` (`src/pages/FirstStepsPage.tsx`), `CONNECT_DISCORD_TASK_IDS` (`src/pages/ConnectDiscordPage.tsx`), wired per `course_key` by `COURSE_COMPLETION_SPECS` in `src/pages/TrainingPage.tsx`. These drive the course cards and the specs the client sends to `get_course_completion_counts`.

ADR-0050 made both surfaces read live from the source-of-truth rows, so a card's completer count and the dashboard's core-completion tile can now disagree **only** if the app arrays and `lesson_catalog` diverge. Nothing enforced that they agree — and they have already diverged historically (Onboarding was documented as 6 tasks in an earlier migration, seeded as 8 later). PRD §9 flagged this as the last open drift seam and named the fix: "a CI check asserts the arrays equal the catalog." The owner approved the **CI-guard** approach (not an app refactor, not codegen).

## Decision

**A single canonical fixture declares each course's required lesson IDs, and two CI guards prove every other representation equals it; CI fails on any divergence.**

- **Canonical source:** `src/data/course-definition.fixture.json` maps each `course_key` → `{ phase, required_lesson_ids[] }`. It is a plain, dependency-free declaration — no imports, so no dependency-direction concern — and no production code moves. This was chosen over extracting `COURSE_COMPLETION_SPECS` into a shared module because the owner scoped this to a guard, not an app refactor: extracting the specs would either invert dependency direction (a `src/data` module importing page-level task-id constants) or fan out across five call sites, both beyond the sanctioned scope.
- **Vitest guard (blocking, `gate-test`):** `src/test/smoke/course-definition-parity.smoke.test.ts` proves, statically, that the fixture equals (1) the app arrays and their `TOTAL_*` counts, (2) the `COURSE_COMPLETION_SPECS` phase + array wiring in `TrainingPage.tsx`, (3) the SQL literals embedded in the pgTAP guard, and (4) the `lesson_catalog` / `course_catalog` seed in migration `20260520035523_*.sql`. `TOTAL_* === required_lesson_ids.length` is asserted per course — the keystone that makes "completed all task_ids" identical to the card's own "Complete" test (ADR-0050 §4).
- **pgTAP guard (`db-test`):** `supabase/tests/course_definition_parity_test.sql` proves the fixture (embedded as SQL literals) equals the **live** `lesson_catalog active AND required` rows in the migrated DB — `bag_eq` on `(course_key, lesson_id)`, `set_eq` on the course set, and phase parity. This is active/required-aware, so it also catches a later migration that flips a lesson's `active`/`required` flag — something the static seed parse cannot see. Proving the invariant at its owning layer per ADR-0024.
- The pgTAP literals are not a free-floating third copy: the Vitest guard parses the `PARITY-PAIRS` / `PARITY-PHASES` blocks out of the `.sql` file and asserts they equal the fixture, so the fixture, app arrays, pgTAP literals, and DB seed are all locked together.
- **Wiring:** `db-test` previously ran only when `supabase/migrations/` changed; `detect-changes` now also triggers it on `supabase/tests/` changes, so a test-only PR executes its suite (ADR-0029: a guard must actually run). Note `db-test` is currently **informational** — it runs but is not in the required `gate` aggregator — whereas the Vitest guard is **blocking** (`gate-test`). It runs on every migration- or `supabase/tests/`-touching PR, i.e. exactly when `lesson_catalog` can change. Promoting `db-test` into the `gate` aggregator once its whole pgTAP baseline is green would make the live-DB direction merge-blocking too; that is a recommended follow-up, not done here.

Net effect: edit the app arrays without updating the DB definition, or the reverse, and a CI job goes red — the app/fixture/spec/seed-text lock in the **blocking** `gate-test` Vitest guard, and the live-DB proof in the (currently informational, but running) `db-test` pgTAP guard. The app-array-edit direction — the actual historical Onboarding 6→8 failure — is fully merge-blocking; the "a later migration mutated the catalog" direction is proven by the running-but-informational `db-test` until it is promoted.

## Considered options

- **(chosen) One canonical JSON fixture + a Vitest guard + a pgTAP guard.** Zero production code change, matches the repo's static-assertion smoke-test convention, and proves the invariant both statically (blocking gate) and at the DB owning layer. Discriminates (perturbing any one home reddens a real assertion).
- **Extract `COURSE_COMPLETION_SPECS` into a shared `src/data/course-specs.ts` as canonical.** Rejected for this change: it is an app refactor the owner explicitly did not approve, and importing the page-level `FIRST_STEPS_TASK_IDS` / `CONNECT_DISCORD_TASK_IDS` into a `src/data` module inverts dependency direction. A future refactor may still do this; the guard would then simply compare against that module.
- **Codegen: derive the app arrays from `lesson_catalog` (or vice-versa) at build time.** Rejected — heavier, codegen drift/tooling of its own, and the two representations legitimately carry different payloads (the app arrays index rich lesson content; the catalog is metadata). A parity check is the minimum that removes the drift without coupling the shapes.
- **Rely on the ADR-0050 pgTAP + the reviewer.** Rejected — nothing mechanically stops an app-array edit from diverging from the catalog, which is exactly the historical failure.

## Consequences

- **Positive:** the card and its dashboard tile can no longer silently disagree; adding/removing a lesson now requires editing the fixture, the app array, the migration seed, and the pgTAP literals together, and any omission is caught in CI. The fixture is a single, human-readable statement of the course→lesson mapping.
- **Negative / trade-offs:** adding a lesson touches four coordinated homes instead of one (the accepted cost of not extracting/coupling the representations). The Vitest guard parses the migration seed and the pgTAP literals by regex; the marker-delimited blocks keep that robust, and the parsers fail closed (an empty parse reddens rather than passes). The DB seed parse cannot see a later `active`/`required` flip — which is precisely why the pgTAP guard also runs against the live migrated DB.
- **Follow-up (recommendation, NOT in this PR):** `get_course_completion_counts` still trusts the client-sent `task_ids`. It could instead derive the required set from `lesson_catalog` server-side, removing the client's ability to send a stale/adversarial spec. Deferred to keep this change scoped to the guard; the guard makes the client specs provably correct in the meantime.

## Confirmation

`npx vitest run src/test/smoke/course-definition-parity.smoke.test.ts` is green on the real repo (all homes agree) and goes red when any single home is perturbed (verified by adding a bogus id to `FIRST_STEPS_TASK_IDS`). The pgTAP suite runs in the `db-test` CI job (informational — see the Wiring note) against a freshly-migrated DB. Both guards are referenced by committed tests and discriminate, per ADR-0022 / ADR-0023.

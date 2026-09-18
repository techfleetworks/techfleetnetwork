# ADR 0045 — Displayed community stats are live-derived from the source of truth, never from a stored counter

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: ADR-0026 (expand/contract); ADR-0024 (prove invariants at the owning layer / pgTAP); ADR-0035 (migrations-applied gate / prod has no ledger); ADR-0019 (architecture gate); `decisions.md` §2 (one fact, one owner); PRD [`docs/architecture/stats-integrity-prd.md`](../architecture/stats-integrity-prd.md).

## Context

The Courses page ("N members completed this course") and the Network Activity "All Time" dashboard show
community numbers. They are not trustworthy, and one symptom pins the cause: **Platform Signups has read 768 for
months** while the platform passed **1,500+ users**.

Every wrong number is the same defect — a **stored/denormalized value read for display** instead of a live count
of the owning rows:

- `total_signups` has one writer, `recompute_all_stats()`, run only by a cron [conditional on the `pg_cron`
  extension](../../supabase/migrations/20260520040032_65e8a5dd-d56f-4bf5-9981-a6e1300c8042.sql). On prod
  (hand-applied, no migration ledger — ADR-0035) that job isn't running, and there is no per-signup writer, so
  the snapshot froze. → 768 forever.
- The course-card counter `course_completion_stats.total_completions` has **two writers** — a per-completion
  trigger (`+1`, never decrements) and a full-overwrite recompute — over a `course_completions` ledger that is
  `ON CONFLICT DO NOTHING` and therefore **only grows**.
- The counter's definition of "completed" (`lesson_catalog` required rows) is **decoupled** from the card's own
  definition (the app's `*_TASK_IDS` arrays) and has already diverged historically (Onboarding 6→8 tasks).
- "Core Course Completions" reads `all_course_completions_total` — it shows _all_ completions under a _core_
  label.

This violates `decisions.md` §2 (one fact, one owner): a stored total sits next to the rows it should be computed
from, kept alive by a job that can (and did) silently stop.

The historical figures (Beginner 1101, Advanced 780, pre-platform Applications 890) are a different case: they
are frozen Airtable imports from before the platform, with no live source in our DB, and there are no
beginner/advanced courses on the platform yet. The owner's decision is that they stay static.

## Decision

**A number shown to a human is a pure function of the source-of-truth rows, computed at read time. No stored
counter is read for display; no background job stands between the rows and the number.**

1. **`get_course_completion_counts(_course_specs jsonb)`** is rewritten (same signature) to count, live from
   `journey_progress`, the non-test members who completed **every `task_id` in the spec** for that `phase` — the
   exact task list the card uses. Because `TOTAL_* === task_ids.length` is guaranteed in the data files, the
   count is identical to "members whose card shows Complete," by construction. It no longer reads
   `course_completion_stats`.
2. **`get_network_stats()`** returns live counts for platform-owned facts — signups, all/core/onboarding course
   completions, discord links, applications, badges, and their past-7d slices — computed directly from
   `profiles` / `badges_awarded` / `general_application_submissions`, non-test. Course completions are derived
   **live from `journey_progress` against `lesson_catalog`'s required set** (the same current-completion notion
   the cards use), **not** the append-only `course_completions` ledger — so an un-complete drops out of the
   dashboard too. It no longer reads `network_stats_snapshots`. Overrides, projects, and the **static
   historical** values are unchanged. (`lesson_catalog` is the server-side owner of "which tasks make a course";
   unifying it with the app's `*_TASK_IDS` arrays is the tracked follow-up — PRD §9.)
3. **"Core Course Completions"** shows the live `tier='core'` count — value now matches the label.
4. **Static historicals stay static.** Beginner/Advanced/pre-platform figures read from
   `network_stats_historical` (immutable); the live overlay for the beginner/advanced tiers is `0` until such
   courses exist on-platform, at which point they join the live model additively.
5. **Enforcement — three independent locks, all in CI** (so this cannot regress):
   - **pgTAP** (`supabase/tests/stats_live_derivation_test.sql`, `db-test` job): insert/remove a completion and
     the RPC count moves in the same transaction; test accounts are excluded. A stored counter cannot pass.
   - **Vitest guard** (`src/test/smoke/stats-live-derivation.smoke.test.ts`): the display functions in the
     latest migration must not reference `course_completion_stats` / `network_stats_snapshots`.
   - **arch-gate rule** (`arch-gate.config.json`, via `arch-encode`): `src/**` may not reference those counter
     tables; the standing rule with ❌/✅ lives in `decisions.md` §2.
6. **Expand/contract (ADR-0026).** This is the expand: new function bodies (same signatures) + a supporting
   index on `journey_progress`; safe to apply before/after the frontend deploys (the frontend already sends the
   specs). Dropping the now-unread display counters (`course_completion_stats`, the trigger/recompute writes to
   it) is a **later** contract migration, after this is verified applied.

## Considered options

- **(chosen) Live-derive display numbers; delete the display counters (expand now, contract later).** Removes the
  entire class of bug — no counter to freeze, no second writer, no job dependency, and the count shares one
  definition with the card. At ~1,500 users / tens of thousands of `journey_progress` rows, ~15 indexed
  `count(*)`s in a `STABLE PARALLEL SAFE` function, cached 60s client-side, are well within budget.
- **Fix the cron / re-run recompute.** Rejected — restores today's number once but leaves a snapshot that
  refreezes the next time the job stops, and leaves the two-writer counter and the decoupled definition intact.
  It is the "just refresh it" non-fix the owner explicitly ruled out.
- **Keep counters, add the missing triggers (incl. a per-signup `+1`).** Rejected — more writers for one fact
  (worse under §2), still divergent on un-completes/test-flag changes/backfills, and still not the same
  definition as the card.
- **Materialized view refreshed transactionally.** Deferred — a legitimate escalation _if_ live reads ever
  become a measured hot spot, but it is still a cache to invalidate; premature at this scale. Recorded as the
  future performance lever in the PRD.

## Consequences

- **Positive:** every live number equals reality on every read; signups tracks `profiles` immediately; the card
  count can never disagree with the card; the mislabel is fixed; three CI locks make regression a build failure.
  The dead cron and the display counters become removable.
- **Negative / trade-offs:** `get_network_stats` does more work per call (mitigated by an index + client cache +
  `PARALLEL SAFE`); the repo carries a transient "expanded but not yet contracted" state (the still-written but
  now-unread `course_completion_stats`) until the contract migration lands; a future genuine hot-spot may need
  the materialized-view escalation. Static historicals remain a manual, owner-owned input by design (§6 of PRD).

## Confirmation

pgTAP proves the live behavior at the DB (`db-test`); the Vitest smoke guard proves the read path never reverts
to a counter; the arch-gate rule + `decisions.md` §2 block the UI from wiring back to one. After deploy, the
read-only `docs/architecture/stats-integrity-verify.sql` must report **delta = 0** for every live number — the
acceptance test. Every stats PR is reviewed against this ADR (judge-arch).

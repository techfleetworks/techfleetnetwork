# ADR 0052 — Retire the stats-snapshot subsystem (the contract half of ADR-0050)

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: ADR-0050 (live-derived stats — the expand half); ADR-0026 (expand/contract); ADR-0036 (schema-reconciliation gate / prod has no ledger); ADR-0024 (prove invariants at the owning layer / pgTAP); `decisions.md` §2 (one fact, one owner); `supabase/migrations/CLAUDE.md`.

## Context

ADR-0050 (PR #361, live on prod) made every displayed community number a **live count of its owning rows**: `get_network_stats()` and `get_course_completion_counts(jsonb)` now compute counts directly from `profiles` / `journey_progress` / `lesson_catalog` / `badges_awarded` / `general_application_submissions` on every read. They **no longer read** the stored counter tables `course_completion_stats` or `network_stats_snapshots`.

Per ADR-0026 that was the **expand**: it left the counter tables and the recompute/reconcile machinery in place so it was safe to apply before/after the frontend deploy. Those objects are now **vestigial** — nothing reads them for display — but they are not inert:

- `recompute_all_stats()` still runs every 15 minutes via the `recompute-network-stats-every-15m` cron, rewriting two dead tables.
- The per-completion trigger fn `fn_evaluate_course_completion` and the general-app trigger fn `trg_general_app_submitted` still `INSERT` into `network_stats_snapshots` / `course_completion_stats` on every completion/submission.
- `admin_recompute_stats()` / `admin_reconcile_parity()` (and its inner `reconcile_course_badge_parity()`, plus the `StatsControlsCard` admin UI) exist only to poke the dead subsystem.

**The one live duty hidden inside recompute — the badge landmine.** `get_network_stats.badges_earned` is a live `count(*)` of `badges_awarded` (non-test, excluding `phase_completed:%`). Three badge kinds feed it. Two already have live emitters we keep (`course_completed:*` via `fn_evaluate_course_completion`; `application_submitted` via the general-app trigger). The **third, `discord_linked`, is emitted ONLY by `recompute_all_stats()`'s backfill `INSERT`** — there is no live trigger for it (`set_discord_linked_at` only stamps a timestamp). Deleting recompute without a replacement would silently stop `discord_linked` badges and make `badges_earned` undercount.

## Decision

**Remove the stored counter tables and the recompute/reconcile machinery that only served them, in one focused contract migration (`20260918160000_retire_stats_snapshot_subsystem.sql`), after first giving `discord_linked` a live emitter so no badge is lost.**

1. **New live `discord_linked` trigger.** `fn_emit_discord_linked_badge()` (SECURITY DEFINER) fires `AFTER INSERT OR UPDATE OF discord_user_id ON profiles`: when `discord_user_id` becomes non-empty it calls `fn_emit_badge(user_id, 'discord_linked', 'profile', user_id::text, COALESCE(discord_linked_at, now()))` — the **same badge identity** recompute used, so it dedups against existing rows. The migration backfills any currently-linked profile missing the badge (idempotent). This is the single unique duty lifted out of recompute.
2. **`fn_evaluate_course_completion`** is `CREATE OR REPLACE`d to drop **only** the `network_stats_snapshots` / `course_completion_stats` increment blocks; it keeps the `course_completions` ledger `INSERT` and the `fn_emit_badge` call.
3. **`trg_general_app_submitted`** is `CREATE OR REPLACE`d to drop **only** the `network_stats_snapshots` increment block; it keeps the submission `INSERT` and the badge emit.
4. **`admin_set_test_account`** is `CREATE OR REPLACE`d (same `(uuid, boolean)` identity, boolean return, `audit_log` write) **without** its trailing `recompute_all_stats()` call — flipping `is_test_account` is now reflected live by `get_network_stats` on every read.
5. **Retire recompute/reconcile:** unschedule the `recompute-network-stats-every-15m` cron (guarded `pg_cron` check) and `DROP` `recompute_all_stats()`, `admin_recompute_stats()`, `admin_reconcile_parity()`, `reconcile_course_badge_parity()`, and the `recompute_all_stats_lock_key()` helper. Delete the `StatsControlsCard` admin component and its System Health usage.
6. **`DROP TABLE course_completion_stats` and `network_stats_snapshots`** (their RLS policies drop with them). No FK, view, or surviving function references them once 2–5 land.
7. **Untouched:** `network_stats_overrides`, `network_stats_historical` (owner: frozen figures), and `get_network_stats` / `get_course_completion_counts` themselves (already live from ADR-0050).

`stats_drift_log` is **deliberately left in place**: the ADR-0036 drift allowlist still tracks its `delta` / `auto_recomputed` columns as pending prod reconciliation (DRIFT-B). Dropping the table would strand those waivers and force an unrelated unwind of the ADR-0036 shrink ratchet. Its only writer (`reconcile_course_badge_parity`) is dropped, so it is now an empty orphan; retiring it is deferred to whoever resolves DRIFT-B.

## Considered options

- **(chosen) Add the live `discord_linked` trigger, then drop the counters + machinery in one contract migration.** Completes ADR-0050's expand/contract cycle, removes the dead cron and two-writer counters, and preserves `badges_earned` by construction (same badge identity, deduped).
- **Drop the machinery without a discord trigger.** Rejected — silently stops `discord_linked` badges and undercounts `badges_earned` the moment the next member links Discord. This is the landmine the ADR exists to defuse.
- **Keep recompute, only stop reading its output.** Rejected — leaves a 15-minute cron rewriting dead tables, two writers on `course_completion_stats`, and admin buttons that "reconcile" nothing; exactly the vestigial state ADR-0050 promised to remove.
- **Also drop `stats_drift_log` now.** Rejected for this PR — it is coupled to the ADR-0036 DRIFT-B allowlist + shrink ratchet; unwinding that is out of scope and would enlarge the blast radius of a focused contract.

## Consequences

- **Positive:** the dead cron stops; the per-completion/submission triggers no longer write two now-deleted tables; `discord_linked` badges are emitted the instant a member links (no batch dependency); the schema shrinks (−2 tables, −5 functions, −8 columns) and the admin UI loses two buttons that did nothing useful. `badges_earned` is unchanged.
- **Negative / trade-offs:** this is a **contract** migration, so the ADR-0036 `db-schema-gate` will report the new trigger + its function as "declared but absent from prod" and stay **red until the migration is hand-applied to prod** (`supabase db push`) — expected, and it clears on apply. `stats_drift_log` remains as an empty orphan table until DRIFT-B is resolved. Historical `discord_linked` badges keep their original `awarded_at` (the backfill is `ON CONFLICT DO NOTHING`).

## Confirmation

pgTAP (`supabase/tests/retire_stats_snapshot_test.sql`, `db-test` job) proves, in a rolled-back txn, that (a) completing a course still emits the `course_completed` badge, (b) setting `profiles.discord_user_id` emits a `discord_linked` badge live, and (c) the dropped tables/functions no longer exist. The existing `stats-live-derivation` pgTAP + smoke guard (ADR-0050) continue to prove the display RPCs read live. The `db-schema-present` BASELINES are updated to the post-contract derived counts in the same PR. Reviewed against this ADR and ADR-0050 (judge-arch).

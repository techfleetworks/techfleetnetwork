
# Enterprise stats v4 — SQL source of truth, course-level counting, 1:1 badge↔course

## What changed from v3 (per your direction)
- **"Core Course Completions" = total (user × course) completions**, not distinct users. If Jane finishes 3 courses, that's **3**.
- **General Applications Submitted = distinct users with a completed+submitted general application** (one per user, ever).
- **Badge rule (explicit): every course completion = exactly 1 badge + exactly 1 increment to that course's completion count.** Same event, two writes, atomic.

Frozen per your earlier direction: `projects_live=11`, `projects_previously_completed=120`, past-7d beginner/advanced=`0`. Stored as `network_stats_overrides` rows (admin-editable, no code changes needed).

---

## How a single course completion is tallied (the exact flow)

A "course" = a row in `course_catalog`. A user "completes" a course when their `journey_progress` rows for that course's required `lesson_catalog` IDs all have `completed=true`.

### Step-by-step, atomically inside one transaction

```text
User clicks "Mark complete" on the last lesson of, say, "agile-mindset"
        │
        ▼
INSERT/UPDATE journey_progress (user_id, phase, task_id, completed=true)
        │
        ▼   AFTER INSERT/UPDATE trigger: trg_journey_progress_complete
        │
        ├─► fn_evaluate_course_completion(user_id, lesson_id)
        │     • looks up course_key from lesson_catalog
        │     • counts completed lessons for that user × course
        │     • if completed_count == required_count for that course:
        │         ├─► INSERT INTO course_completions
        │         │     (user_id, course_key, completed_at)
        │         │     ON CONFLICT (user_id, course_key) DO NOTHING
        │         │     RETURNING xmax = 0 AS first_time
        │         │
        │         └─► IF first_time:
        │               ├─► INSERT INTO badges_awarded
        │               │     (user_id,
        │               │      badge_code='course_completed:agile-mindset',
        │               │      source='course_completion',
        │               │      source_id=<course_completions.id>::text)
        │               │     ON CONFLICT (user_id,badge_code,source_id) DO NOTHING
        │               │
        │               └─► UPDATE network_stats_snapshots
        │                     SET value = value + 1
        │                     WHERE metric_key IN
        │                       ('core_course_completions_total',
        │                        'badges_earned_total');
        │                   UPDATE course_completion_stats
        │                     SET total_completions = total_completions + 1
        │                     WHERE course_key = 'agile-mindset';
```

### Guarantees that come out of this design
1. **One completion = one badge = one count, always.** `course_completions` has `UNIQUE (user_id, course_key)`, so re-running the trigger (idempotent backfills, replays, double clicks) cannot double-count. `badges_awarded` mirrors with `UNIQUE (user_id, badge_code, source_id)` where `source_id` is the `course_completions.id`.
2. **Course count and badge count can never disagree** — they're written in the same transaction, gated by the same `first_time` flag. A nightly reconciliation job verifies `count(course_completions where course_key=X) == count(badges where badge_code='course_completed:X')`.
3. **Total course completions = sum over courses** — exactly what the home page card shows.
4. **Per-course tally on Training page** reads `course_completion_stats.total_completions` directly — O(1).
5. **Rollback safe** — if anything in the trigger fails, the whole `journey_progress` write fails. No partial state.

### Total = sum of courses (your requirement)
- `network_stats_snapshots.core_course_completions_total` = `sum(course_completion_stats.total_completions)` across all `tier='core'` courses.
- The trigger increments by 1 per first-time course completion. Card on home page reads it in O(1).
- Subtitle on the card (optional): "across N members" — derived from `count(distinct user_id)` over `course_completions` for transparency, NOT used as the primary number.

### What the trigger does NOT do
- Does not award per-phase completions as additional badges (avoids inflating badge count beyond course count). Phase = collection of courses; phase completion is a separate, optional badge family `phase_completed:*` and is NOT added to "Badges Earned" unless you say so. Default: badges = courses + applications + discord_link + observer_role_granted.

---

## How General Applications is tallied

```text
general_applications.status transitions to 'submitted' (or row INSERTed with submitted_at IS NOT NULL)
        │
        ▼ AFTER INSERT/UPDATE trigger: trg_general_app_submitted
        │
        ├─► INSERT INTO general_application_submissions
        │     (user_id, submitted_at)
        │     ON CONFLICT (user_id) DO NOTHING
        │     RETURNING xmax = 0 AS first_time
        │
        └─► IF first_time:
              ├─► INSERT INTO badges_awarded
              │     (user_id, badge_code='application_submitted',
              │      source='general_application',
              │      source_id=<general_application_submissions.id>::text)
              │     ON CONFLICT DO NOTHING
              │
              └─► UPDATE network_stats_snapshots
                    SET value = value + 1
                    WHERE metric_key IN
                      ('general_applications_total', 'badges_earned_total');
```

- `general_application_submissions` has `UNIQUE(user_id)` → exactly one per user, ever. Re-submits, drafts, edits do not inflate.
- "General Applications Submitted" = `count(general_application_submissions)` = `network_stats_snapshots.general_applications_total`. Live platform only — Airtable 890 lives in `network_stats_historical`, never added.

---

## Complete badge taxonomy (what counts toward "Badges Earned")

| badge_code | source row | When awarded | Counts toward Badges Earned? |
|---|---|---|---|
| `course_completed:<course_key>` | `course_completions` row | First time a user completes a course | ✅ yes (1:1 with course count) |
| `application_submitted` | `general_application_submissions` row | First submission per user | ✅ yes (1:1 with general apps count) |
| `discord_linked` | `profiles.discord_user_id` set | When discord_user_id becomes non-null | ✅ yes |
| `observer_role_granted` | `observer_role_grants` log row | When grant-observer-role edge fn succeeds | ✅ yes |
| `project_active_participant` | `project_team_members.status='active'` | When user becomes active on a project | ✅ yes |
| `phase_completed:<phase>` | derived | Optional secondary badge (off by default) | ❌ no (would double-count vs courses) |

`Badges Earned` card = `count(*) from badges_awarded where badge_code NOT LIKE 'phase_completed:%'`. One row in `badges_awarded` = one badge.

---

## Tables (full SQL surface)

```text
-- catalog (replaces TS constants)
course_catalog(course_key PK, phase, tier, display_label, display_order, active)
lesson_catalog(lesson_id PK, course_key FK, phase, display_order, required, active)
journey_phase_definitions(phase PK, required_tasks, total_tasks, tier, display_label)
  -- required/total auto-recomputed by trigger on lesson_catalog change
FK: journey_progress.task_id → lesson_catalog.lesson_id (validated post-backfill)

-- event ledgers (one row per real-world thing)
course_completions(id PK, user_id, course_key FK, completed_at)
  UNIQUE(user_id, course_key)
general_application_submissions(id PK, user_id, submitted_at)
  UNIQUE(user_id)
badges_awarded(id PK, user_id, badge_code, source, source_id, awarded_at, metadata)
  UNIQUE(user_id, badge_code, source_id)

-- precomputed read surface
network_stats_snapshots(scope, metric_key, value, computed_at) PK(scope, metric_key)
course_completion_stats(course_key PK, total_completions, past_7d_completions, computed_at)
network_stats_overrides(metric_key PK, value, reason, updated_by, updated_at)  -- frozen literals live here
network_stats_historical(metric_key PK, value, source, last_synced_at, synced_by) -- Airtable lives here

-- support
profiles.is_test_account bool default false (+ partial index)
```

## Functions / triggers

- `fn_evaluate_course_completion(user_id, lesson_id)` — SECURITY DEFINER; called by `trg_journey_progress_complete`. Idempotent, locks the (user, course) row with `SELECT … FOR UPDATE` to prevent concurrent double-increment.
- `fn_emit_application_badge()` — SECURITY DEFINER; called by `trg_general_app_submitted`.
- `fn_emit_simple_badge(user_id, badge_code, source, source_id)` — shared helper for discord/observer/project badges.
- `recompute_all_stats()` — full rebuild, scheduled via `pg_cron` every 15 min, guarded by `pg_try_advisory_xact_lock`. Defense-in-depth against missed triggers. Idempotent.
- `get_network_stats()` — public RPC, returns a single JSON merging `network_stats_snapshots` + `network_stats_overrides` + `network_stats_historical`. O(1), no scans.
- `get_course_completion_counts(_course_keys text[])` — public RPC, reads `course_completion_stats`.

## Backfill plan (one-time migrations, transactional)

1. Seed `course_catalog` + `lesson_catalog` from current TS constants.
2. Reconcile `journey_progress.first_steps` orphan IDs (DB has 15, constant has 12) — list, decide keep/rename/drop, then apply.
3. Add FK on `journey_progress.task_id`.
4. Walk history: for every (user, course) where all required lessons completed, insert `course_completions` + `badges_awarded`. Order by `min(completed_at)` so `awarded_at` is historically accurate.
5. Walk `general_applications` history: insert `general_application_submissions` + `badges_awarded` for every distinct submitter.
6. Backfill `discord_linked`, `observer_role_granted`, `project_active_participant` badges from existing tables.
7. Run `recompute_all_stats()` once → snapshots populated.
8. Seed `network_stats_overrides` with frozen literals (11, 120, 0, 0).
9. Seed `network_stats_historical` with Airtable values (890, 1101, 1881, 780) + sync timestamp from existing baseline row.

## RLS + security
- All snapshot/override/historical/ledger tables: `SELECT` for authenticated; writes only via SECURITY DEFINER functions/triggers. `REVOKE EXECUTE … FROM anon, authenticated` on internal helpers. Public RPCs are read-only.
- `search_path` pinned on every new function.
- Override edits go through admin-only RPC + `audit_log` (hash-chained).
- Recompute job uses advisory lock; circuit-breakered Airtable sync unchanged.

## Indexes
- `journey_progress (user_id, phase, completed)`, `(task_id)`
- `course_completions (course_key, completed_at)`, `(user_id)`
- `badges_awarded (badge_code, awarded_at)`, `(user_id, badge_code)`
- `general_application_submissions (submitted_at)`
- `profiles (is_test_account) WHERE NOT is_test_account`

## Test-account exclusion
- `profiles.is_test_account` column + backfill admins/test patterns. Toggle column on UserAdminPage.
- All snapshot computations filter `NOT is_test_account` at the source — single point of truth.

## UI changes
- `NetworkActivity.tsx`: keep title **"Core Course Completions"** (you were right — it's a count of courses, not people). Subtitle: "(across N members)" for transparency. Beginner/Advanced All Time cards render 0 (real numbers in Historical section). Tooltips on every card. Add Historical (pre-platform) section with last-synced timestamp.
- `TrainingPage.tsx`: per-course count reads `course_completion_stats`; label "**N members completed this course**" (no "you included" needed since count is total, not exclusive).
- `UserAdminPage.tsx`: Test account toggle column.
- `/admin/curriculum` (new): AG Grid for course_catalog + lesson_catalog (admins only). Edits propagate to `journey_phase_definitions` via trigger.
- `SystemHealthPage` Content tab: "Refresh historical numbers" + "Recompute stats now" + "Reconcile course↔badge counts" (runs the parity check) + last-recompute timestamp.

## Reconciliation (your trust requirement)
Nightly job + on-demand admin button runs:
```sql
-- Must always be true
ASSERT (select count(*) from course_completions)
     = (select count(*) from badges_awarded
        where badge_code like 'course_completed:%');

ASSERT (select count(*) from general_application_submissions)
     = (select count(*) from badges_awarded
        where badge_code = 'application_submitted');

ASSERT (select sum(total_completions) from course_completion_stats)
     = (select value from network_stats_snapshots
        where metric_key='core_course_completions_total');
```
Mismatch → row inserted in `stats_drift_log` + Discord admin alert + auto-runs `recompute_all_stats()`.

## BDD coverage (mandatory, tri-layer Then-clauses)
`bdd_scenarios` feature_area = `Network Activity`:
- `STATS-001` First-time course completion creates 1 `course_completions` row, 1 `badges_awarded` row, +1 to `core_course_completions_total`, +1 to `badges_earned_total`. [UI]/[DB]/[Code]
- `STATS-002` Re-completing same course = no new rows, counters unchanged.
- `STATS-003` Three different courses by same user = 3 in `core_course_completions_total`, 3 in `badges_earned_total`.
- `STATS-004` General application first submission = 1 submission row, 1 badge, +1 both counters.
- `STATS-005` Test account writes are filtered from snapshots.
- `STATS-006` Frozen override values returned unchanged by RPC.
- `STATS-007` Historical Airtable values returned in `historical` block, never summed into live.
- `STATS-008` `recompute_all_stats()` matches incremental snapshots within tolerance 0.
- `STATS-009` Reconciliation detects forced drift and self-heals.
- `STATS-010` Concurrent completion of same course (two transactions) results in exactly 1 badge.
- `STATS-011` RLS denies anon writes to all ledger and snapshot tables.
- `STATS-012` `lesson_catalog` FK rejects unknown task_id.
- `STATS-013` Cache key v3 evicts stale localStorage.
- `STATS-014` Course catalog edit propagates `journey_phase_definitions.required_tasks`.
- `STATS-015` Realtime update on user's own course completion bumps per-course tally without refetch.

Smoke tests: `network-stats.smoke.test.ts`, `course-completion-stats.smoke.test.ts`, `badge-parity.smoke.test.ts`.

## Technical layout

```text
DB migrations (numbered, transactional)
├─ 001 course_catalog + lesson_catalog + FK on journey_progress
├─ 002 journey_phase_definitions (auto-derived via trigger)
├─ 003 course_completions ledger + UNIQUE
├─ 004 general_application_submissions ledger + UNIQUE
├─ 005 badges_awarded + UNIQUE + RLS
├─ 006 fn_evaluate_course_completion + trg_journey_progress_complete
├─ 007 trg_general_app_submitted + helpers for discord/observer/project badges
├─ 008 network_stats_snapshots/overrides/historical + RLS
├─ 009 course_completion_stats + incremental update triggers
├─ 010 profiles.is_test_account + backfill + partial index
├─ 011 first_steps orphan reconciliation
├─ 012 recompute_all_stats() + pg_cron schedule + advisory lock
├─ 013 backfill course_completions + badges_awarded from history
├─ 014 backfill general_application_submissions + badges
├─ 015 backfill discord/observer/project badges
├─ 016 seed overrides (11/120/0/0) + historical (890/1101/1881/780)
└─ 017 get_network_stats v3 + get_course_completion_counts v2

App
├─ src/services/stats.service.ts → new shape; cache key v3
├─ src/components/NetworkActivity.tsx → subtitle, Historical section, tooltips
├─ src/hooks/use-course-completion-counts.ts → reads course_completion_stats, realtime
├─ src/pages/TrainingPage.tsx → "N members completed this course"
├─ src/pages/UserAdminPage.tsx → Test account toggle column
├─ src/pages/admin/CurriculumAdminPage.tsx (new)
├─ src/pages/SystemHealthPage.tsx → Recompute / Refresh historical / Reconcile buttons
└─ tests as above

Edge
└─ airtable-baselines-sync → writes to network_stats_historical
```

## Expected post-ship values
- Platform Signups: ~440 (test accounts excluded at source)
- Core Course Completions (total): real sum across all courses, served O(1) from snapshot
- Per-course Training tallies: real per-course totals, realtime
- General Applications Submitted: distinct platform submitters (no Airtable add)
- Badges Earned: equal to course completions + general apps + discord links + observer grants + active project participants (parity-checked nightly)
- Beginner / Advanced (live): 0 (real Airtable in Historical)
- Projects Live / Previous Projects / past-7d beg/adv: 11 / 120 / 0 / 0 from overrides (admin-editable)
- Historical (pre-platform): 890 · 1101 · 1881 · 780 + last synced timestamp

## Out of scope
- Discord-linked card (already accurate).
- Map stats.
- Migrating lesson content (copy, components) into SQL — only identifiers, thresholds, ordering.

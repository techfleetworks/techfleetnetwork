# PRD — Stats integrity: make every displayed number impossible to be wrong or stale

**Status:** proposed · **Owner:** mdenner · **Author:** engineering (this branch: `fix/course-completion-counts`)
**Companion ADR:** [ADR-0050 — live-derived stats, single source of truth](../adr/0050-live-derived-stats-single-source.md)
**Date:** 2026-09-18

---

## 1. Problem

Two surfaces show community numbers, and they are not trustworthy:

- **Courses page** (`/courses`) — each card shows "N members completed this course" (481 / 358 / 185 / 146…).
- **Network Activity "All Time"** dashboard — Platform Signups (768), Discord Members (4072), Core Course
  Completions (860), Beginner/Advanced registrations (1101 / 780), General applications (1057), Badges (2011).

Reported symptom that pins the root cause: **Platform Signups has read 768 for months** while the platform now
has **1,500+ users**. A number that cannot move while its underlying reality doubles is, by definition, not
being read from reality.

This PRD proves what each number actually is, why it drifts, and specifies the architecture that makes each one
**structurally impossible to be inaccurate** — enforced so it can't regress.

## 2. Root cause (one disease, several symptoms)

Every wrong number is a **stored/denormalized value read for display instead of a live count of the
source-of-truth rows.** Three concrete failure modes, all present today:

1. **Frozen snapshot + dead refresh.** `total_signups` has exactly one writer — `recompute_all_stats()` — and
   that runs only from a pg_cron job that is [conditional on the `pg_cron` extension existing](../../supabase/migrations/20260520040032_65e8a5dd-d56f-4bf5-9981-a6e1300c8042.sql). On prod (migrations hand-applied,
   no ledger — see ADR-0035) that job is evidently not running, so the snapshot froze at the last manual
   recompute. There is **no per-signup writer**, so nothing else ever updates it. → **768 forever.**
2. **Two writers for one fact.** The course-card counter `course_completion_stats.total_completions` is written
   by _both_ a per-completion trigger ([`fn_evaluate_course_completion`](../../supabase/migrations/20260520035523_115783bd-e683-43ed-8a98-69e247011b34.sql), `total_completions + 1`, never
   decrements) _and_ a full-overwrite `recompute_all_stats()`. Two writers of one number always diverge.
3. **Definition decoupled from the UI.** The card's "Complete" state uses the app's TypeScript task lists
   (`ALL_AGILE_LESSON_IDS`, `FIRST_STEPS_TASK_IDS`, …); the _count_ uses a separate DB definition
   (`lesson_catalog` required rows). Nothing enforces they agree — and they have already diverged historically
   (Onboarding was documented as 6 tasks in [an earlier migration](../../supabase/migrations/20260323010915_fbc19291-380c-488b-becc-64e8c1d797c3.sql), seeded as 8 later).

A derived ledger (`course_completions`) sits between the rows and the counters and is `INSERT … ON CONFLICT DO
NOTHING` — it **only ever grows**; un-completing a task or making a lesson required later never removes anyone.

## 3. Investigation — every number, proven

Legend: **Displayed** = what the screenshots show. **Reads from** = the exact source the code returns.
**Verdict** with the mechanism. Exact live deltas marked _pending §8_ fill in from the read-only prod script;
Platform Signups is anchored by the reported 1,500+.

| #   | Card                                      | Displayed             | Reads from                                                                   | Owner today                             | Verdict                                                                                                                                                                                                                        |
| --- | ----------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Platform Signups                          | **768**               | `network_stats_snapshots(total_signups)`                                     | `recompute_all_stats` (dead cron)       | **WRONG — frozen.** Truth ≈ 1,500+ (`count(*) profiles`). No per-signup writer; cron not running.                                                                                                                              |
| 2   | Discord Members                           | **4072**              | `discord_guild_stats.member_count` via edge fn (Discord API, 24h cache)      | Discord                                 | **Live & external.** Plausibly correct, but it's the Discord _server_ headcount — a different population than platform signups. Label should say so.                                                                           |
| 3   | Core Course Completions                   | **860**               | `network_stats_snapshots(all_course_completions_total)`                      | `recompute_all_stats`                   | **WRONG twice:** (a) shows _all_ completions, not core (mislabel — [`NetworkActivity.tsx`](../../src/components/NetworkActivity.tsx) reads `course_completions_total`); (b) built on the only-grows ledger. _delta pending §8_ |
| 4   | Beginner course registrations             | **1101**              | `network_stats_historical(historical_beginner_courses)`                      | Airtable import (static)                | **Correct AS historical** — a frozen pre-platform figure. Keep static by design (§6). No platform "beginner" courses exist yet.                                                                                                |
| 5   | Advanced course registrations             | **780**               | `network_stats_historical(historical_advanced_courses)`                      | Airtable import (static)                | **Correct AS historical** — frozen by design. Keep static.                                                                                                                                                                     |
| 6   | General applications submitted            | **1057**              | `890` historical **+** `network_stats_snapshots(general_applications_total)` | Airtable + `recompute_all_stats`        | **Mixed.** Historical 890 = static/OK; live portion is a drift-prone snapshot. _delta pending §8_                                                                                                                              |
| 7   | Badges Earned                             | **2011**              | `network_stats_snapshots(badges_earned_total)`                               | `recompute_all_stats` (sum of 3 counts) | **WRONG/unverifiable.** A derived sum (`courses + apps + discord`) recomputed by the dead path; can double-count. _delta pending §8_                                                                                           |
| 8   | "N members completed this course" (cards) | 481 / 358 / 185 / 146 | `course_completion_stats.total_completions`                                  | trigger **and** recompute (two writers) | **WRONG — drift-prone.** Two writers; only-grows ledger; definition decoupled from the card. _delta pending §8_                                                                                                                |

**Confirmed structural facts backing the verdicts** (from code, no prod access needed):

- Signups: only writer is `recompute_all_stats`; refresh is a conditional cron → freezes. ✅ proven in code.
- Core card reads `all_course_completions_total`, not a core figure → mislabel. ✅ proven in code.
- Card counter has two writers + only-grows ledger + decoupled definition. ✅ proven in code.
- Historical 1101/780/890 are static imports. ✅ proven in code (they never recompute).

## 4. Target architecture — live-derived, single source of truth

**Principle:** a number shown to a human is a **pure function of the source-of-truth rows, computed at read
time.** No stored counter for display. No second writer. No background job the number depends on. If the rows
say 1,500, the screen says 1,500 — the same request that reads the rows produces the number.

| #   | Card                              | New source of truth (live)                                                                                                                                                               |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Platform Signups                  | `count(*) FROM profiles WHERE NOT is_test_account` — live in `get_network_stats()`                                                                                                       |
| 2   | Discord Members                   | unchanged (live Discord API); relabel intent "Discord community members"                                                                                                                 |
| 3   | Core Course Completions           | live `count` (from `journey_progress` + `lesson_catalog`) of `tier='core'` completions, non-test — decrements on un-complete; label now matches value                                    |
| 4/5 | Beginner / Advanced registrations | **unchanged — forever static** historical Airtable values (§6)                                                                                                                           |
| 6   | General applications              | historical 890 (static) + **live** `count(*) general_application_submissions` non-test                                                                                                   |
| 7   | Badges Earned                     | **live** `count(*) badges_awarded` non-test (single definition, not a re-summed derived value)                                                                                           |
| 8   | Course-card completers            | live count of members who completed **exactly the task_ids the card uses** (the specs the client already sends), non-test — count ≡ "members whose card shows Complete," by construction |

Card #8 is the keystone: the client already passes each course's `phase` + `task_ids` to the RPC and the RPC
**throws them away**. We make it _use_ them. Because `TOTAL_* === task_ids.length` is guaranteed in the data
files, "completed all task_ids" is identical to the card's own "Complete" test — the count and the card can
never disagree.

## 5. Enforcement — why it can't regress ("impossible to break")

Correctness once is not the ask; **un-regressable** is. Three independent locks, each wired into CI:

1. **The DB layer proves itself (pgTAP, `supabase/tests/stats_live_derivation_test.sql`).** Insert a completion
   → the RPC's count goes up by one _in the same transaction_; un-complete → it goes down; flag a user
   `is_test_account` → they drop out. A stored counter cannot pass these; only a live read can. Runs in the
   `db-test` CI job (ADR-0024: prove invariants at their owning layer).
2. **The read path can't quietly revert to a counter (Vitest guard, `src/test/smoke/stats-live-derivation.smoke.test.ts`).**
   Asserts the display functions `get_network_stats` / `get_course_completion_counts` in the latest migration
   **do not reference** `course_completion_stats` or `network_stats_snapshots`, and that the card hook still
   calls the live RPC. If someone reintroduces a snapshot read, CI fails.
3. **The UI can't wire itself back to a stored counter (arch-gate rule).** A new rule in
   `arch-gate.config.json` forbids `course_completion_stats` / `network_stats_snapshots` anywhere under
   `src/**` (components, pages, hooks, services). Encoded via `arch-encode`; documented in `decisions.md` §2.

Standing rule added to `decisions.md` (§2 "One fact, one owner"):

```
❌ never — display reads a stored/aggregated counter that a job must refresh
const { data } = await supabase.rpc('get_network_stats')   // returns snapshot rows a cron rebuilds
value={stats.total_signups}                                // frozen when the cron dies
✅ always — display is a live count of the owning rows, computed in the read
-- get_network_stats(): SELECT count(*) FROM profiles WHERE NOT is_test_account
```

## 6. What stays static — by design

Beginner (1101) and Advanced (780) "registrations", and the pre-platform General Applications (890), are
**historical Airtable imports from before the platform existed.** There is no live source in our DB to derive
them from, and there are **no beginner/advanced courses on the platform yet** ("coming soon"). Per owner
decision they remain **forever static**. "Impossible to be inaccurate" here means: they are read from the
`network_stats_historical` table (immutable), never presented as if live, and the live overlay for these two
tiers stays `0` until such courses exist. When platform beginner/advanced courses ship, they join the
live-derived model (§4) as an additive overlay on top of the frozen historical base.

## 7. Rollout — expand/contract (ADR-0026), prod is hand-applied

- **Expand (this change):** new live function bodies (same signatures) + a supporting index on
  `journey_progress`. Safe to apply before/after the frontend deploys — the deployed frontend already sends the
  specs; the new bodies just start honoring them and reading live. No column drops, no signature changes.
- **Frontend:** `NetworkActivity.tsx` reads the now-correct core figure for card #3 (one-line source swap).
- **Contract (later, separate migration — NOT now):** once the live path is verified applied, stop writing the
  display counters (`course_completion_stats` in the trigger + recompute) and drop the table; retire the
  `recompute_all_stats`→`course_completion_stats` write. The ledger/badges/other snapshots that other features
  still read are out of scope and untouched here.

## 8. Verification (read-only, authorized)

Run [`docs/architecture/stats-integrity-verify.sql`](./stats-integrity-verify.sql) against prod
(`pzvqxdgoztbfikfuifix`) in the Supabase SQL editor. It compares each **displayed** value to the **live truth**
and shows each snapshot's `computed_at` (proving the freeze). It is strictly `SELECT`-only. Results fill the
"_pending §8_" deltas above and seed the pgTAP fixtures. After the fix ships, the same script must show
**delta = 0** for every live number — that is the acceptance test.

## 9. Non-goals / open items

- **Discord Members population** — keeping the live external number; relabel to "Discord community members" is a
  copy change, pending owner confirmation.
- **Core Completions: events vs people** — this PRD counts _completions_ (matches the "Completions" label). If
  you want _distinct people_, it's a one-line switch to `count(distinct user_id)`; flagged for your call.
- **Course definition has two homes (tracked follow-up).** Server-side, `lesson_catalog` is the one owner of
  "which tasks make a course" and is used by both display RPCs. The course _cards_ still use the app's
  `*_TASK_IDS` arrays. These must stay in lockstep; unifying them — the app reads the catalog, or a CI check
  asserts the arrays equal the catalog — is the follow-up that closes the last drift seam. Until then, a card
  and its dashboard tile can disagree only if the catalog and the arrays diverge (the historical 6→8 class).
- **Pre-existing component data-access smell** — `NetworkActivity.tsx` calls `supabase.functions.invoke`
  directly (component-scoped rule violation); pre-existing, tracked separately, not fixed here to keep this
  change scoped to stats integrity.

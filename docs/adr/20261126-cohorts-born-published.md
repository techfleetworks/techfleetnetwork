# 20261126 — Cohorts are born published; the class owns approval, the cohort owns only its registration state

- Status: Accepted
- Date: 2026-11-26
- Deciders: product owner (mdenner), engineering
- Amends: ADR-0061 (cohort registration_status), 20261125-cohort-registration-open-invariant
- Related: 20260502160222 (classes & cohorts tables/RLS/RPCs), 20261118-public-classes-pages

## Context and problem statement

Two problems surfaced from the same root cause — the cohort carried its **own**
publish lifecycle (`draft → pending_review → published`) in parallel with the
class's, and the two were coupled through `submit_class_for_review`:

1. **Submit was broken on a live class.** The cohort "Submit" button called
   `submit_class_for_review`, which does an unconditional
   `UPDATE classes SET status='pending_review'`. On an already-**published** class
   the `classes_validate_transition` trigger rejects `published → pending_review`,
   so adding/opening a cohort on a live class threw "Invalid class status
   transition". Submit was only ever designed for a *draft* class's first approval.

2. **A cohort needed a second, redundant publish step.** An admin created a cohort
   (born `draft`), then had to "submit" it through the same review flow the class
   already went through — even though the class was already approved. Until that
   second publish, the cohort was filtered out of the public gateways
   (`cohort.status='published'`), so it read "not open" publicly.

The owner's decision: **a cohort should not have its own approval flow.** Approval
belongs to the class. A cohort, once it exists under a published class, is simply
visible, and its only public-facing lifecycle is its `registration_status`
(Coming Soon → Register Now → Live → Finished).

## Decision

Make the cohort's publish state a non-decision and enforce every correctness
invariant at the database (the owning layer), so no code path or raw query can
reach an inconsistent state.

- **Cohorts are born published.** `cohorts.status` DEFAULTs to `published`
  (was `draft`). A new cohort is immediately active; its visibility is still gated
  by the **parent class** being published (RLS + gateways unchanged), so admin
  review still happens once, at the class level. `published_at` is auto-set by the
  `cohorts_validate` trigger when a row is (or becomes) published.
  `draft`/`pending_review` remain valid enum values for backward compatibility but
  are no longer the creation path.

- **The register-open invariant is enforced at the TABLE, not just the RPC.** The
  `cohorts_validate` trigger (BEFORE INSERT OR UPDATE) now rejects
  `registration_status IN ('register_now','live')` unless
  `status='published' AND end_date >= current_date` (`ERRCODE check_violation`).
  This closes the gap in 20261125: that guard lived only in
  `set_cohort_registration_status`, so a **raw table UPDATE bypassed it**. Now the
  table itself is the floor — the RPC keeps its copy for a friendlier error, but the
  trigger makes a false "open" *structurally* unreachable regardless of the writer.

- **`submit_class_for_review` is decoupled and guarded.** It (a) refuses any class
  not in `draft` (`check_violation`), so it can never again attempt an illegal
  transition on a live class, and (b) no longer moves cohorts into review (cohorts
  are born published; they do not ride the class approval flow). The class-level
  submit (for a draft class's first approval) is unchanged and still legitimate.

- **Owners may edit their own published cohorts.** The teacher UPDATE RLS policy
  previously allowed editing only `draft`/`pending_review` cohorts. Since cohorts
  are now born published, that would have locked owners out of their own cohorts, so
  the policy is widened to the owner's cohorts at any status, with a WITH CHECK that
  pins `class_id` ownership. The DB triggers remain the real guards: an owner still
  cannot un-publish (no `published → draft` transition exists), cannot set a false
  "open" (table invariant), and cannot set a non-https registration URL.

- **One read source, unchanged.** `cohortPublicEnrollment` remains the single
  mapping from `registration_status` to the public state; both public surfaces
  derive from it (20261125). The UI drops the cohort "Submit" button and the cohort
  "Publish" badge (every cohort is published now; only the terminal
  Archived/Cancelled states are badged, matching the Cohorts table).

## Why false negative / false positive / desync is structurally impossible (for new writes)

- **False "open" (register_now/live on a cohort the gateways hide):** unreachable —
  the table trigger rejects the write itself, from any caller, raw SQL included.
- **The Submit crash:** unreachable — the RPC refuses a non-draft class, and the UI
  no longer offers a cohort-level submit.
- **A cohort stuck needing a second publish:** gone — cohorts are born published.
- **Read/label desync:** both public surfaces read the one `cohortPublicEnrollment`
  mapping (an exhaustive switch; a fifth enum value is a compile error).

## Honest limits (what is NOT absolute)

0. **Write-time, forward-only + existing data.** The trigger and default govern
   writes from the moment they are applied. Existing `draft` cohorts on published,
   future-dated classes are brought forward by the one-shot backfill
   (`20261126092000`); genuinely ended cohorts are left closed.
1. **`end_date` is date-granular** (`current_date`, DB session tz). A cohort set
   `register_now` while valid *becomes* ended at its `end_date`; the gateway's
   `end_date >= today` filter then correctly stops showing it (it reads
   closed/absent, never a false open). Moving it to `finished` is a separate
   lifecycle step (an auto-transition is a possible follow-up).
2. **Edge cache.** The public gateways cache with `stale-while-revalidate=86400`, so
   a correct change can be masked by a stale edge copy for up to ~60s. This is
   propagation latency, not a correctness gap in the stored state.
3. **Audit coverage — closed.** Because the widened UPDATE policy makes a direct
   owner table-write of `registration_status` possible, the audit row is written by a
   DB trigger (`trg_cohort_registration_audit`, `20261126094000`) that fires on every
   change from any path — the RPC no longer writes its own (no double). So the audit
   trail cannot miss a registration change, whatever writer made it. (Its `reason`
   column is NULL for trigger-written rows; the one-shot backfill keeps its own
   descriptive audit row, as it runs before the trigger exists.)
4. **"Cannot fail / cannot be hacked" is not a literal guarantee.** Writes are
   restricted to owner-or-admin by RLS and the SECURITY DEFINER RPCs, and the
   invariants above are enforced at the DB; but the absence of all bugs cannot be
   proven. The claims that *are* proven are the ones the pgTAP suite exercises.

## Verification

- pgTAP (`cohort_lifecycle_test.sql`, runs in `db-test`): a raw table UPDATE setting
  `register_now` on a draft cohort is rejected (`23514`); on a published, future
  cohort it is allowed; a new cohort INSERT defaults to `published` with
  `published_at` set; an owner can UPDATE their own published cohort;
  `submit_class_for_review` on a published class is rejected. Plus the existing
  registration-status authorization + invariant suite.
- vitest/BDD: `cohort-lifecycle.feature` documents born-published, the class-only
  approval, and the open-state gate; `cohortPublicEnrollment` exhaustiveness is
  already covered.

## Consequences

- Changed (migrations, hand-applied to prod AFTER merge, expand-only): the
  `cohorts_validate` trigger (invariant + `published_at`); `cohorts.status` default;
  the teacher UPDATE RLS policy; `submit_class_for_review`; a one-shot backfill; and
  `trg_cohort_registration_audit` + the RPC (audit moved to the trigger).
- Changed (app): `ClassDetailPage` (remove the cohort Submit button + Publish badge,
  widen the Edit affordance to the owner); `cohort.service` (remove `submitForReview`).
- Follow-up (not blocking): `end_date`→`finished` auto-transition; shortening the
  gateway SWR window.

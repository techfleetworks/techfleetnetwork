# 20261125 — A cohort's registration is "open" from one source; opening it is impossible unless it would show open

- Status: Accepted
- Date: 2026-11-25
- Deciders: product owner (mdenner), engineering
- Amends: ADR-0061 (cohort registration_status) — for the two OPEN states only
- Related: 20261118-public-classes-pages (B10), 20261118-public-courses-gateway (A8)

## Context and problem statement

A public visitor reported a class whose enrollment was set to "open" but whose
public **class-detail page showed "not open."** Root cause (observed from code):

"Publicly open to register" was the **AND of three independent gates across two
intentionally-orthogonal axes** (ADR-0061):

1. `cohort.status = 'published'` — the publish/approval axis
2. `cohort.end_date >= today` — not yet ended
3. `registration_status ∈ {register_now, live}` — the enrollment-phase axis

The public gateways (`public-class-detail`, `public-classes`) filter cohorts to
`status='published' AND end_date>=today` **in SQL**, then the frontend reads
`registration_status` for the badge. The owner-facing control set **only
`registration_status`, at any publish status, with no guard** (`set_cohort_
registration_status`). So setting a cohort to **Register Now** while its publish
`status` was not `published` (only the *class* was published) left the gateway
**filtering the cohort out before the badge ran** → the public showed "not open."
Nothing reconciled the two axes, so this inconsistent-but-reachable state was a
**structural false negative** (and the mirror false positive existed: a published,
future, `register_now` cohort past its real registration window read "open").

A secondary read-side risk: the open/closed label was computed in **two places**
(the catalog listing's `enrollmentStateOf` and the detail page's inline badge), free
to drift.

## Decision (owner: enforce at the write boundary)

Make a false open/closed state **structurally impossible**, on both the read and the
write side:

- **One read source.** `cohortPublicEnrollment(cohort)` (in `use-public-catalog.ts`)
  is the single mapping from `registration_status` to the public state
  (`open | coming_soon | closed`), an **exhaustive `switch`** over the enum
  (`assertNever` default → a fifth status is a compile error, never a silent
  mislabel). The catalog listing (`enrollmentStateOf`), the `isRegisterable`
  primitive, and the detail-page badge/CTA all derive from it, so the two public
  surfaces cannot disagree.
- **One write invariant.** `set_cohort_registration_status` (the ONLY writer of
  `registration_status`, owner-or-admin, SECURITY DEFINER) now **rejects the OPEN
  states (`register_now`/`live`) unless the cohort is `published` AND
  `end_date >= current_date`** (migration `20261125150000`, `ERRCODE
  check_violation`). An admin can no longer "open enrollment" on a cohort that would
  be filtered out publicly — they get a clear error ("publish the cohort first")
  instead of a silent mismatch. `coming_soon`/`finished` stay settable at any publish
  status, so the axes remain orthogonal where that is harmless.
- **The admin UI mirrors the DB** (defense in depth + UX): `canOpenRegistration()` in
  `validators/cohort.ts` — one authored rule, identical to the DB guard — disables the
  Register Now / Live options in `CohortRegistrationStatusControl` until the cohort is
  publishable-open, so the error rarely has to fire.

This **amends ADR-0061's** "set at ANY publish status" latitude: it holds for the
not-yet-open states, but opening registration now requires the cohort to actually be
publicly open.

## Why this makes false neg/pos impossible (and the honest limit)

- **False negative** ("open but shows not open") is unreachable: the open state cannot
  be *stored* on a cohort the gateways would filter out — the write guard forbids it.
- **False positive** from drift is unreachable: both public surfaces read the one
  `cohortPublicEnrollment` mapping; they cannot label the same status differently.
- **Honest limits:** (1) the `end_date` gate is time-based — a cohort set `register_now`
  while valid *becomes* ended when its `end_date` passes; the write guard checks at
  write time, and the gateway `end_date>=today` filter then correctly stops showing it
  (so it reads "closed/absent", not a false "open") — moving it to `finished` is a
  separate lifecycle step. (2) The public gateways cache with
  `stale-while-revalidate=86400`, so a *correct* change can be masked by a stale edge
  copy briefly; that is a propagation-latency follow-up (shorten the SWR window or bust
  on write), not a correctness gap in the state itself.

## Verification

- pgTAP (`cohort_registration_status_test.sql`, runs in `db-test`): `register_now` on a
  draft cohort → rejected (`23514`); on a published-but-ended cohort → rejected;
  `coming_soon` on a draft → allowed; `register_now` on a published, future cohort →
  allowed. Plus the existing owner/admin/outsider authorization cases.
- vitest: `cohortPublicEnrollment` maps all four statuses exhaustively and
  `isRegisterable`/`enrollmentStateOf` derive from it; `canOpenRegistration` mirrors the
  DB rule (published + future only).

## Consequences

- Changed: `set_cohort_registration_status` (migration, hand-applied to prod — apply
  AFTER merge per the migrations policy); `use-public-catalog.ts` (the one mapping);
  `PublicClassDetailPage` (derives from it); `validators/cohort.ts`
  (`canOpenRegistration`); `CohortRegistrationStatusControl` + `ClassDetailPage` (UI
  gating).
- Follow-up (not blocking): the public-gateway cache SWR window; and (optional)
  auto-transitioning a `register_now` cohort to `finished` when its `end_date` passes.

# 20261119 — Public classes catalog shows every published class, not only those with an open cohort

- Status: Accepted
- Date: 2026-11-19
- Deciders: product owner (mdenner), engineering
- Ticket: public-access B10 follow-up (logged-out testing, 2026-11-19)
- Related: 20261118-public-classes-pages (B10), 20261116-public-class-gateway (A3).

## Context and problem statement

Logged-out testing of the live `/courses` catalog showed empty Basic and Advanced
tabs ("Nothing here yet"). The `public-classes` gateway returned `count: 0` for
every track, including the unfiltered call, with HTTP 200 and no error — the query
genuinely matched zero rows.

Root cause (layer: data / API, the gateway query): `public-classes` embedded
cohorts with `cohorts!inner`, i.e. an INNER JOIN, plus `cohorts.status=published`
and `cohorts.end_date >= today`. That dropped any published class with no open
(published, future-dated) cohort. But the authenticated list the member sees
(`ClassService.listPublishedByTrack`, `src/services/class.service.ts:37`) filters
on **`status=published` + `track` only** — no
cohort requirement. So the public catalog and the in-app list applied two different
visibility rules to the same data: a published class with no open cohort was visible
to a signed-in member and invisible to a logged-out visitor.

## Decision

- **The public catalog uses the same class-visibility rule as the authenticated
  list: a published class in the track is listed, open cohort or not.** Owner
  decision 2026-11-19 ("match the app").
- **Implement it as a LEFT join**, not `!inner`: `cohorts:cohorts(...)` with the
  embedded `status=published` + future-date filters kept. All published classes
  return; each carries its open cohorts, or `cohorts: []` when it has none. No
  change to the §6 anon field set (same columns), so the A7 allowlist guard is
  unaffected.
- **The card tells the truth about enrollment.** `ClassCardTile` shows
  "Registration open" (success) only when `cohorts.length > 0`, else a neutral
  "Enrollment not open" — never a success badge over a class a visitor cannot yet
  register for. Neutral tone per the B9 ContentCard rule (the contrast-tuned amber
  "opening soon" tone is still owed; `neutral` is its documented stand-in).
- **Empty state means no published class at all** (the word "open" is dropped from
  the copy), since visibility no longer depends on a cohort.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** one visibility rule for a class across both auth states;
  reuse the §6 gateway; no misleading status in the view.
- **Decision:** keep the **gateway (Adapter)** as the single public projection and
  align its parent-row filter to the authenticated query; push the open/closed
  distinction into a **Humble view** status, not into row inclusion.
- **Candidates considered:**
  - (a) LEFT join + honest card status — chosen. One visibility rule, status tells
    the truth.
  - (b) Keep `!inner` (only classes with an open cohort are public) — rejected by
    the owner; it diverges from the member list and hides published classes.
  - (c) Loosen the gateway but leave the hardcoded "Registration open" badge —
    rejected: it would label a no-cohort class as open-for-registration (false UX).
- **Failure / rot prevented:** public/authenticated visibility drift (a class a
  member sees but a visitor cannot); a misleading "Registration open" badge.
- **Security / data trade-off:** opens no new data surface — same §6 columns, same
  service-role gateway; cohorts are still scoped to published + future-dated.
- **Verify correct application:** vitest — `PublicCoursesPage` lists a class with
  `cohorts: []` as "Enrollment not open" (not dropped, not the empty state) and a
  class with a cohort as "Registration open"; a smoke test
  (`public-classes-left-join.smoke.test.ts`) locks the gateway to a left join
  (rejects `!inner`).
- **Real guarantee:** the catalog's class SET now matches `status=published` +
  `track`. It does not prove each field renders identically across auth states, nor
  assert anything about the underlying published-class data in prod.

## Consequences

- Changed: `supabase/functions/public-classes/index.ts` (left join),
  `src/pages/PublicCoursesPage.tsx` (status + empty copy),
  `src/pages/public-classes.feature` (+1 scenario), tests.
- A published class with no open cohort now appears on the public catalog marked
  "Enrollment not open". If prod still shows empty tabs after deploy, the cause is
  that no classes are published in that track — a data state, not this bug.
- The gateway must deploy (edge-functions workflow) for the change to take effect;
  the frontend ships via Cloudflare Pages on push to main.

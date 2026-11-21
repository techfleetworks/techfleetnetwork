# 20261120 — Public enrollment reads registration_status; open-cohort CTA is "Register" → Gumroad for everyone

- Status: Accepted
- Date: 2026-11-20
- Deciders: product owner (mdenner), engineering
- Ticket: public-access B10 follow-up (logged-out review, 2026-11-20)
- Related: 20261119-public-classes-visibility, 20261120-public-class-detail,
  34c1a3bd "Allow People Who Do Not Have Accounts…" §6.7 (no-account registration),
  34d1a3bd "Allow Students to Register for Classes" (ledger-verified registration).

## Context and problem statement

The public catalog decided "Registration open" purely from "a cohort exists that
is `cohort_status='published'` and not yet ended." It ignored
`cohort_registration_status` (`coming_soon → register_now → live → finished`) —
the field that actually means "open for enrollment." Measured prod state: the three
Basic classes each have a Jan-2027 cohort that is `cohort_status='draft'` +
`registration_status='coming_soon'`, so the gateway returned zero cohorts and the
pill read "Enrollment not open" — technically true, but it couldn't say "Opening
soon," and when a cohort does open it still wouldn't drive a purchase.

Two owner decisions (2026-11-20):
1. The point of exposing Basic/Advanced classes to logged-out visitors is **Gumroad
   purchases**, so an open cohort's main CTA must be **"Register"** (straight to
   Gumroad), not "Join Platform first."
2. "Join" is the right CTA only when enrollment is **not** open.

The no-account flow was already designed (ticket 34c1a3bd §6.7, AC-R1/R2): a
logged-out buyer can pay on Gumroad with no platform account; the sale is held as
`pending_user` and becomes an `active` registration after they sign up with the
same verified email. So sending logged-out visitors straight to Gumroad is safe.

## Decision

- **Surface `cohort_registration_status` to anon** by adding it to the §6 anon
  cohort field set (`ANON_FIELDS.cohort` in `_shared/public-visibility.ts`; also the
  hardcoded cohort embed in `public-classes`). It is a non-sensitive public phase
  label. `cohort_status` (draft/published lifecycle) **stays authed-only**; anon
  never sees a draft cohort because the gateways still filter `status='published'`.
- **Enrollment state is derived from `registration_status`** (`enrollmentStateOf`):
  `register_now`/`live` → **open**; else a published upcoming `coming_soon` cohort →
  **coming_soon**; else **none**. The pill reads: open → "Registration open",
  coming_soon → "Opening soon", none → "Enrollment not open".
- **The open-cohort CTA is "Register" → the cohort's Gumroad URL for EVERYONE**
  (logged-out included), reversing the earlier anon "Join Platform to register"
  (20261118-public-classes-pages). A `coming_soon` cohort shows "Registration opens
  soon" + a "Join Platform" fallback (the newsletter alert CTA replaces this in a
  follow-up). The Gumroad URL is still `safeHref`-guarded and opens in a new tab.
- **No gateway filter change**: still `status='published' AND end_date >= today`.
  Draft cohorts are never shown publicly — so a class whose cohorts are draft stays
  "Enrollment not open" until an admin **publishes** the cohort (a data action, not a
  code one).

## Pattern-decision record (pattern-selector)

- **Problem / forces:** the public page must reflect the real enrollment phase and
  drive Gumroad conversion, without leaking draft cohorts or weakening the §6
  allowlist.
- **Decision:** extend the **Strategy** (§6 field policy) with one non-sensitive
  field, and move the open/soon/none decision into a pure, tested helper
  (`enrollmentStateOf`) the Humble views consume.
- **Candidates considered:**
  - (a) Surface registration_status + derive state + Register-to-Gumroad — chosen.
  - (b) Key "open" off `cohort_status='published'` only (status quo) — rejected: a
    published `coming_soon` cohort reads "open," and a class can't say "opening soon."
  - (c) Show draft cohorts to make "coming soon" classes appear — rejected: leaks
    unfinished offerings; publishing is the admin's call.
- **Failure / rot prevented:** a misleading pill; a dead-end for upcoming cohorts;
  logged-out visitors bounced to a login wall instead of to checkout.
- **Security trade-off:** `registration_status` is a coarse public label (no PII, no
  secret); the A7 guard validates it against the widened allowlist. The `pending_user`
  no-account handling (money truth in the ledger, access only after verified signup)
  is owned by the webhook/projection tickets, not this view.
- **Verify correct application:** vitest — `enrollmentStateOf`/`isRegisterable`
  (register_now/live=open, coming_soon=soon, finished/none=none); the detail page
  shows "Register"→Gumroad for a register_now cohort (anon and member), "Opening soon"
  with no Register for coming_soon, and a disabled CTA for a non-https URL; the card
  pill reflects the three states. Deno — anon cohort exposes registration_status but
  not cohort_status.
- **Real guarantee:** the UI reflects the cohort's registration phase and routes an
  open cohort to Gumroad. It does not itself verify the purchase or create a
  registration — that is the ledger/webhook pipeline (34c1a3bd §6.7 / 34d1a3bd).

## Consequences

- Changed: `_shared/public-visibility.ts` (§6 anon cohort += registration_status),
  `public-classes/index.ts` + `public-class-detail/lib.ts` (select/map the field),
  `use-public-catalog.ts` (type + `enrollmentStateOf`/`isRegisterable`),
  `PublicCoursesPage.tsx` (card pill), `PublicClassDetailPage.tsx` (cohort badge +
  Register CTA), tests + Deno tests, `public-classes.feature`.
- **Action for the owner (data, not code):** the Jan-2027 Basic cohorts are `draft`.
  Publish them (set `cohort_status='published'`, keep `registration_status='coming_soon'`)
  for them to show "Opening soon · Jan 2027"; flip to `register_now` when enrollment
  opens to get "Registration open" + the Register button. Code cannot show a draft.
- Frontend deploys via Cloudflare Pages; the gateway changes deploy via the
  edge-functions workflow (the live post-deploy smoke, PUB-SMOKE-001, still guards it).
- Follow-up (separate PR): the newsletter "Get alerts" capture on the coming_soon /
  no-cohort state (Email Octopus double opt-in).

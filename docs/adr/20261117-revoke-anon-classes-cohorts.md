# 20261117 — Revoke anon from classes/cohorts; service-role the public-classes feed (A6)

- Status: Accepted
- Date: 2026-11-17
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access) A6, D-A §0.3
- Related: ADR-20261116 (D-A gateway), 20261116-public-class-gateway, 20261116-public-visibility-auth-aware (A5), A7 allowlist guard

## Context

`public.classes` / `public.cohorts` have a published-RLS policy with no role
restriction, so the **anon** role can read every published-class column directly
via PostgREST (`select=*`) — the D-A problem the gateways were built to close. The
gateways (public-class-detail, public-project-*) already run under the service role
and apply the §6 allowlist, but the lockdown isn't real until anon loses its direct
grant. The one remaining anon-key reader was `public-classes` (the Framer feed).

Framer is being retired (the platform moves to GitHub + Cloudflare Pages), so its
feed contract has **no scope** — the anon §6 data is groundwork for the new platform.

## Decision

1. **Migrate `public-classes` to the service role** (`getAdminClient`, not the anon
   key) and strip its select to the **§6 anon set** (no `owner_user_id`; cohorts
   reduced to id/label/dates/registration_url — status/capacity/timezone are
   authed-only). This retires the A7 `a7-allow` waiver: the A7 guard now validates
   the select is within the anon allowlist, with no exemption.
2. **`REVOKE ALL ON public.classes, public.cohorts FROM anon`** (migration
   20261117000000). `authenticated` keeps its grants (the logged-in app reads via
   the published-RLS policy); only `anon` is revoked.

## Blast radius (verified, not assumed)

The only anon reader of classes/cohorts is `public-classes` (now service-role). All
frontend reads (`class.service`, `cohort.service`, `UniversalSearch`) run in authed
app contexts → the `authenticated` role, unaffected. All other edge functions that
read classes (`notify-class-published`, `public-class-detail`) use `getAdminClient`
→ service-role, unaffected. So the REVOKE breaks nothing internal; it closes only
the direct external anon path (the threat).

## Consequences

- Anon can read class data ONLY through a service-role gateway that applies the §6
  allowlist — a column added to the table can no longer leak to anon via `select=*`.
- **Apply-ordering (critical):** the REVOKE migration must be applied ONLY AFTER the
  `public-classes` service-role change is deployed; before that, public-classes still
  uses the anon key and the REVOKE would break it. The whole branch deploys together
  at Phase B, so apply the migration with that deploy (not before). Flagged in the
  migration header.
- **Rollback:** `GRANT SELECT ON public.classes, public.cohorts TO anon;` restores
  the prior state if a missed anon reader surfaces.
- **Proof:** `supabase/tests/revoke_anon_classes_cohorts_test.sql` (pgTAP) asserts
  anon has zero privileges and cannot SELECT either table.

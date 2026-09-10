# ADR 0037 — Gumroad membership: event-sourced ledger → deterministic projection is the source of truth

- Status: Accepted
- Date: 2026-09-09
- Deciders: TechFleet (owner)
- Note: **Retroactive** — this documents the decision already implemented in
  `supabase/migrations/20260803120000_membership_ledger_projection.sql` (2026-08-03), which
  shipped without an ADR. Written now so the "why" of a load-bearing, money-adjacent system
  is not left only in migration comments.
- Related: `supabase/functions/gumroad-webhook`, `gumroad-reconcile`, `gumroad-backfill`,
  `gumroad-backfill-all`; `src/hooks/use-membership-realtime.ts`;
  `supabase/tests/membership_ledger_test.sql`;
  `20260803160500_gumroad_backfill_all_cron.sql` (nightly sweep); ADR-0038 (identity resolution, extends this); ADR-0026 (expand/contract); ADR-0024 (invariant proven at the DB).

## Context and problem statement

Tech Fleet sells paid membership (founding + Early Career) through **Gumroad**. Payment is
Gumroad's; recognition ("is this person a paid/founding member?") is ours. The prior approach
mirrored Gumroad state into a `profiles.is_founding_member` flag written by app/edge code —
the classic "same fact in two places, kept in sync" shape. It drifted: recognition depended
on login, SKUs were keyword-guessed, and a member could in principle PATCH their own tier
(mass-assignment). Payments and accounts also arrive in either order (purchase before signup,
or under a different email), so a naive "sale updates a user" write silently dropped sales
with no matching account.

## Decision drivers

- One owner per fact; recognition must be **derived**, never a hand-maintained mirror.
- Drift must be **structurally impossible**, not a thing we remember to avoid.
- Refunds/disputes must revoke; founding must be a permanent latch.
- Recognition must not depend on the member logging in.
- Keep Gumroad as merchant of record (no PCI scope expansion).

## Considered options

1. **Keep the mirrored flag, sync it more carefully / via Zapier.** Untracked logic, misses
   refunds, needs DB credentials in a third party, and re-creates the drift it aims to fix.
2. **Bring payments in-house.** Explodes PCI scope for no benefit at this volume.
3. **Event-sourced ledger → deterministic projection (chosen).** `gumroad_sales` is an
   append-only ledger (source of truth); a single `SECURITY DEFINER compute_membership()`
   derives `profiles.membership_*` from the ledger + a `membership_products` catalog.

## Decision outcome

**Chosen: Option 3.** Implemented as:

- **`gumroad_sales`** — append-only ledger, `sale_id` unique (idempotent replays), RLS
  deny-by-default (no member write path), lifecycle columns (refund/dispute/cancel/ended).
- **`membership_products` (+ aliases)** — deterministic SKU→{tier, founding, billing}; no
  keyword guessing. Founding SKU `ftpql` seeded.
- **`compute_membership(user_id)`** — the single writer of `membership_*`. Founding latch;
  refund/dispute downgrade; billing derived from the sale's recurrence; idempotent.
- **Column guard trigger** — `profiles.membership_*` is physically un-writable by anyone but
  the projector (txn-local flag) or `service_role`. Kept as a **guarded derived column
  rather than a view** deliberately: Supabase Realtime's `postgres_changes` needs a row
  change to broadcast the live membership update the client subscribes to.
- **Projection triggers** — re-project on any ledger change (kills login-dependence);
  resolve pending sales on profile creation.
- **`reproject_membership_drift()` + `membership_health()`** — nightly drift sweep, a
  tripwire that audits any paid profile with no backing sale, and an admin health surface.

## Consequences

**Good**
- Recognition can't drift: the displayed value is a pure function of the ledger, one writer,
  rebuildable at any time; refunds/disputes revoke; founding latches.
- Login-independent; Realtime pushes the change live.
- Gumroad stays merchant of record.

**Bad / accepted**
- More moving parts than a boolean (ledger, catalog, projector, guard, triggers, cron).
- A sale for a not-yet-registered or different-email buyer sits `pending_user` until an
  account/identity resolves it — the residual addressed by **ADR-0038**.

## Confirmation

- `supabase/tests/membership_ledger_test.sql` (pgTAP) proves the projector logic and attacks
  the security properties as a member (can't self-grant, can't insert a sale, can't call the
  projector, non-admin can't reattach).
- `membership_health()` surfaces `pending_user_count` and `invariant_violations`; the nightly
  sweep re-projects drift and raises the tripwire.

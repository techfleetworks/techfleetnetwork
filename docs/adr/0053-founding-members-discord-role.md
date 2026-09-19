# ADR 0053 — Auto-grant the "Founding Members" Discord role (event-sourced, self-healing)

- Status: Accepted — staged rollout; **this PR ships PR-A (dark foundation) only**
- Date: 2026-09-18
- Deciders: Morgan Denner
- Epic: Membership / Membership Pilot MVP

## Context

When someone buys founding membership on Gumroad, the "Founding Members" Discord role
(`1533887923597087041`) is added **manually** by an admin, which is slow and error-prone. We
want it automatic — for every existing founding member and every future purchaser — with no
member or admin busywork, covering three scenarios: (1) bought, Discord already connected;
(2) bought, Discord not connected yet; (3) bought **before** signing up to the platform.

A grant cannot be a single webhook call, because the three facts arrive out of order. The role
is a **derived state over three facts**:

> **granted ⇔ (F) `is_founding_member` = true ∧ (A) platform account exists ∧ (D) Discord connected**

So we model it as a convergent projection: whenever F/A/D changes for a user, (re)enqueue a
reconcile; a worker drives the queue to satisfy the invariant, idempotently; a sweep heals
anything a live event missed.

### Grounding correction (the ticket over-claimed "already in place")

A pre-existing design doc said "almost none of this is greenfield." Verified against `main`,
that is **partly wrong**, and this ADR records the real baseline so we don't build on false
premises:

| Ticket claim                                                      | Reality on `main`                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discord_role_grant_queue` supports grant+revoke                  | **Grant-only** — no `revoked_at`/`desired_state` (`…20260418201529…`)                                                                                        |
| A worker drains the queue                                         | **No server worker.** Drain is a _client login hook_ (`src/hooks/use-discord-role-retry.ts`) — a member who never logs back in never gets their role         |
| Connection may be an unverified handle claim (impersonation risk) | Connection is **real Discord OAuth** (`discord-oauth-callback` writes `discord_user_id` only after `/users/@me` proof) → impersonation risk largely **moot** |
| `discord_role_assigned/_failed` audit events                      | Actual event is `discord_bot_error`                                                                                                                          |
| Role id already stored                                            | **Absent** — id `1533887923597087041` was nowhere in the repo                                                                                                |
| Emails a non-member to sign up                                    | **No** — the founding-purchase email (ADR-0042) skips `pending_user` sales                                                                                   |
| Erasure removes the role / cascades queue rows                    | **No** — `handle_user_deletion` ignores both                                                                                                                 |

`is_founding_member` flips **false only on refund/dispute clawback**, not ordinary lapse
(`compute_membership`, `…20260803120000…`), and is column-guarded (only the projector writes it).

## Decision

Build the convergent-queue model, reusing what genuinely exists (`discord_role_grant_queue`,
`manage-discord-roles`, the `grant-observer-role` precedent, OAuth-verified `discord_user_id`,
the founding latch) and adding what's missing. Confirmed product decisions:

1. **Trigger model:** event + self-healing reconcile + assign-on-connect.
2. **Removal:** only when `is_founding_member` is confidently **false** (refund/dispute), mirroring
   the latch. **Fail-closed** (never strip on error/unknown) + a **mass-revoke threshold guard**.
   Ordinary subscription lapse keeps the role (founding is permanent).
3. **Connection:** reuse the existing OAuth flow. If a founding buyer hasn't connected, a **soft**
   in-the-moment interstitial prompts + deep-links (no hard app lock; the sweep grants later).
4. **Non-member:** a Gumroad buyer with no account gets an email telling them to **self-sign-up**
   (no auto-provision — that would touch frozen auth and is a separate, gated follow-up).
5. **Role id:** persisted once in a `discord_roles` config table (auditable), not hardcoded.
6. **Server-side worker** drives the queue (the client login hook is not reliable enough for the
   "structurally impossible to break" bar); a scheduled **reconcile sweep** heals misses.

### Staged rollout (each its own gated PR)

- **PR-A (this PR) — dark foundation.** `discord_roles` config table + seed; the invariant target
  owner `list_founding_discord_role_targets()`; a **dry-run** gap report that only audits counts.
  **No triggers, no enqueue, no Discord calls** — safe to leave live; gives the real target number
  before anything grants.
- **PR-B — grant goes live.** Enqueue bridge (triggers on `is_founding_member` / `discord_user_id`)
  - a **server worker** (edge fn + pg_cron) + the reconcile sweep + one-time backfill enqueue +
    observability. Existing founders start getting the role.
- **PR-C — revoke.** Revoke path on refund/dispute-false, fail-closed, mass-revoke threshold guard,
  dry-run first (isolated so its blast radius is reviewed alone).
- **PR-D — non-member email + connect gate + erasure.** Signup email for `pending_user` founding
  sales; soft connect interstitial; erasure removes the role + cascades queue rows.

## Consequences

- **Good:** correct-by-construction (invariant + idempotent queue + sweep); reuses proven
  primitives; OAuth means the granted account is owner-proven; dry-run-first + isolated revoke
  keep the access-granting/removing risk contained.
- **Cost:** more moving parts than a webhook call, and ~4 PRs because the honest net-new surface
  (server worker, revoke, config, non-member email, reconcile, erasure) is larger than the ticket
  implied.
- **Follow-up (flagged, not built):** Discord-OAuth is already ownership-proven so the ticket's
  impersonation mitigation is unnecessary; auto-provisioning non-members (frozen-auth) remains a
  separate opt-in.

## PR-A proof

`supabase/tests/founding_discord_role_test.sql` (pgTAP): target set = founding ∧ connected only;
dry-run report counts correctly; **enqueues nothing**. `src/test/smoke/founding-discord-role.smoke.test.ts`
guards the seed, the invariant, and the dark guarantee. Expand-only, idempotent migrations.

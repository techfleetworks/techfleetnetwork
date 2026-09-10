# ADR 0038 — Robust identity resolution for Gumroad sales (multi-email + signed user_id)

- Status: Accepted
- Date: 2026-09-09
- Deciders: TechFleet (owner)
- Extends: [ADR-0037](0037-membership-ledger-source-of-truth.md) (the ledger/projection this
  builds on and does not change)
- Related: `supabase/migrations/20260909120000_gumroad_identity_multi_email.sql`,
  `supabase/functions/gumroad-webhook/index.ts`, `supabase/tests/gumroad_identity_multi_email_test.sql`,
  `attach_gumroad_sale()` (existing admin reattach), ADR-0026 (expand/contract), ADR-0024.

## Context and problem statement

The ledger/projection (ADR-0037) is sound. Its one weak point is **how a sale is linked to a
person**: linking is **email-only**. `gumroad-webhook` resolves `resolved_user_id` by matching
the sale email against `profiles.email`; no match → `status = 'pending_user'`. The
resolve-on-signup trigger also matches by `profiles.email`. Email mismatches are fixed
**manually** by an admin calling `attach_gumroad_sale()`, and platform-initiated checkout
carries no identity (a bare Gumroad link).

A reconciliation of the Aug-2026 founding sales (24 buyers) confirmed the impact: buyers with
no account are correctly `pending_user`, but a buyer who purchased under an email different
from their account email (real case: bought as `preetianubolu@…`, account `panubolu@…`) is
silently unrecognized until a human notices and reattaches. That manual, notice-driven path
cannot deliver reliable recognition and does not scale.

## Decision drivers

- Stop silent non-recognition for buyers who **do** have an account under another email.
- Make platform-initiated purchases **self-identifying** (exact link, no email guessing).
- **Never** auto-link on weak signals — a wrong link grants paid access to the wrong person.
- **Extend, do not rebuild** — the ledger/projector/guard are untouched; only the resolution
  layer changes, plus one additive table.
- Expand/contract, idempotent (hand-applied prod migrations, ADR-0026).

## Considered options

1. **Status quo — email-only + manual `attach_gumroad_sale`.** Fine as a fallback; can't be
   the end state (invisible until a human acts).
2. **Fuzzy/name/address auto-matching.** Rejected: false positives attach a paid membership
   to the wrong person — a correctness/security hazard. Identity is never inferred from weak
   signals.
3. **Multi-email person model + one resolution owner + (later) signed `user_id` passthrough
   + self-serve claim (chosen).**

## Decision outcome

**Chosen: Option 3**, entirely additive to the ledger. This change (PR 1) lands the DB core:

- **`profile_email_aliases`** — a per-person set of **verified** additional emails. RLS
  deny-by-default for members (a verified extra email is an identity claim and must never be
  self-asserted without proof); writes come from admin/`service_role` (and, later, a
  SECURITY-DEFINER claim function). An unverified alias never resolves anything.
- **`resolve_gumroad_user(email)`** — the **single owner** of "which user owns this email?",
  checking the profile primary email and the verified alias set. Ambiguity (an email on two
  people) resolves to **none**, never a guess. Used by the webhook and the resolve-pending
  path so identity has one definition.
- **`trg_email_alias_resolve_pending`** — adding/verifying an alias resolves that person's
  `pending_user` sales on the spot (fires the existing projection trigger). So fixing an
  email-mismatch orphan is "add their verified alias," which resolves all their sales and all
  future ones — a generalization of the per-sale admin reattach.
- **All server-side sale→person resolution routes through `resolve_gumroad_user`**: the
  `gumroad-webhook` (live sales) and `gumroad-backfill-all` (historical re-ingest — so a
  backfill also recognizes alias buyers), plus the alias trigger itself, which binds *through*
  the resolver so it inherits the ambiguity guard by construction. `gumroad-reconcile` is the
  one deliberate exception: it binds only the **caller's own** pending sales, keyed on the
  caller's GoTrue-verified JWT email — a distinct, legitimate proof of ownership, not a
  wrong-person risk. The self-serve claim flow (a user adding a *non-login* email) is the
  deferred, auth-zone PR.

**Sequenced next, as separate gated PRs (not in this change):**
- **Signed `user_id` passthrough** at platform-initiated checkout: a short-lived **HMAC-signed
  token** carrying the logged-in `user_id`, passed as a Gumroad URL param and verified by the
  webhook. A raw client-supplied `user_id` is forgeable, so it must be signed and verified,
  not trusted. Requires a new checkout-link edge function + a `GUMROAD_CHECKOUT_HMAC` secret.
- **Self-serve claim flow** (user verifies an email they purchased with → alias added). Held
  because email verification lives in the **frozen auth** zone (06-auth-flow-lockdown); it
  ships only with the auth regression suite.

## Consequences

**Good**
- A person's *any* known email resolves their sales — automatically and immediately.
- Fixing an existing mismatch becomes "add a verified alias" (self-heals all their sales),
  with the admin `attach_gumroad_sale` remaining as the per-sale fallback.
- The ledger/projector is untouched — lowest-risk change that closes the gap.

**Bad / accepted**
- New identity surface (`profile_email_aliases`) ⇒ verification is mandatory before any bind;
  an unverified alias must never resolve a sale. Member self-insert is denied by RLS until the
  verified claim function exists.
- Existing orphans are not auto-fixed by deploy (nobody has aliases yet) — they are remediated
  by adding a verified alias (or the existing admin reattach). One-off SQL accompanies rollout.
- `profile_email_aliases` holds PII ⇒ joins the GDPR erasure path
  (`20260810130000_gdpr_erasure_email_gumroad_pii.sql`) in a follow-up.

## Confirmation

- `supabase/tests/gumroad_identity_multi_email_test.sql` (pgTAP): a verified alias resolves a
  pending sale and projects membership; an **unverified** alias resolves nothing; an ambiguous
  email resolves to none; a member cannot insert an alias (RLS 42501).
- Mechanical arch gate (`npm run check:architecture`) green; `judge-arch` PASS on the diff.
- Post-rollout: `membership_health().pending_user_count` trends toward only genuine
  no-account buyers; the drift tripwire stays at zero.

# ADR 20261009 — Email-Octopus ownership extension for the Welcome-Flow marketing-email override

Status: Accepted

## Context

The Welcome Flow's newsletter step (e) prefills the member's signup email but lets them **override**
the address the marketing list subscribes (brief item 10). That one affordance opens three things the
platform does not have today, and it is the single largest compliance driver in the feature — which is
why it is a **fast-follow** (PR6, product decision P1), decoupled from the core flow, and carries its
own ADR rather than folding into ADR 20261009-welcome-flow-gate / -data-model.

Two facts make the override dangerous if built naively:

1. **Email Octopus is the marketing source of truth (ADR-0017).** The platform holds no local consent
   ledger; marketing state lives in EO, and the local `email_octopus_contact_sync` row evidences
   origin/timing. Consent is write-through to EO via the fail-open, durable, version-ordered queue.
2. **Both erasure triggers key strictly on `auth.users.email`.** On `BEFORE DELETE ON auth.users`,
   `handle_user_deletion()` (winning definition `20260911120000_erasure_completeness_reconcile.sql:23`)
   scrubs by `OLD.email`, and `eo_enqueue_contact_delete_on_user_deletion()` enqueues an EO delete for
   `OLD.email` only. An override address is **by definition different from `auth.users.email`**, so on
   deletion EO would be told to delete the *account* email (which may never have subscribed) while the
   **override address stays subscribed in EO forever** — an unremediated GDPR Art. 17 failure for a
   subprocessor, and one that passes CI silently because nothing today knows the override exists.

The existing self-only RPC `set_my_marketing_subscription(p_subscribed, p_source)` takes **no email
argument** (it subscribes `auth.users.email`) and today coerces any `p_source` outside
`'signup' | 'profile'` to `'profile'` (`20260822120000_email_octopus_sync.sql:87-89`). So both the
source record and the override address need additive, owned extensions — neither can be bolted onto the
self-only RPC without a second identity and a verification step (an unverified override is an
account-takeover / spam-relay vector).

## Decision

Extend EO ownership additively, under ADR-0017 (this **forward-links, it does not supersede** 0017),
in four parts that ship together — **the override does not ship unless all four hold**:

- **A new owned mapping table** `marketing_email_overrides(user_id uuid PK/FK → auth.users,
  marketing_email text, created_at, updated_at)` — **single writer**, row-scoped RLS
  (`auth.uid() = user_id`, like `profiles`), server-side RFC + CR/LF validation with normalized
  `lower()`, and a self-only display read RPC `get_my_marketing_email()` so neither the flow nor the
  profile ever reads `profiles.email` for the toggle's shown address. Subscribing the override requires
  **double-opt-in ownership verification** (EO confirmation to the override address) before it is
  treated as subscribed — the platform toggle reflects intent, not a completed subscription (P5).
- **Erasure cascade inside the winning `handle_user_deletion()`.** A new `CREATE OR REPLACE` migration
  edits the live definition to `enqueue_eo_contact_delete(marketing_email)` for the departing user's
  override row **before** deleting it — so EO erases the address the member was actually subscribed
  under. The standalone `auth.users.email` delete stays; the override delete is additive.
- **`marketing_email_overrides` added to the `REQUIRED` allowlist** of
  `scripts/ci/check-erasure-completeness.mjs` (ADR-0039 guard), so every future redefinition of
  `handle_user_deletion()` is forced to keep erasing it or CI fails red — the gap becomes structurally
  impossible to re-introduce.
- **Additive `p_source` expansion.** `set_my_marketing_subscription` additively accepts
  `'welcome_flow'` (expand/contract, ADR-0026) **before** any consumer sends it; a provider Deno
  contract test asserts the accepted set so the silent-coerce-to-`'profile'` defect cannot recur. The
  override subscribe path routes through the EO queue, never a synchronous EO call on the submit path.

Anti-abuse is part of the decision, not a follow-up: the confirmation send is rate-limited on three
axes (per-user, **per-target-address**, global hourly ceiling) and gated behind a Turnstile token, so
the override cannot be used to email-bomb a victim. Rejected input (malformed / CR-LF / unverified) is
recorded as a validation-rejection security event (user id + kind, **never the raw value**).

This absorbs decision D6 and resolves the former open question P7. It is proven by a pgTAP behavioral
test: given a user with an override address, `DELETE FROM auth.users` leaves no override row **and**
produces an EO `deleted` intent for the override address (mirrors `eo_contact_delete_test.sql`).

## Alternatives considered

- **Descope the override for v1 (recommended fallback).** Ship the newsletter toggle keyed on
  `auth.users.email` only — fully covered by existing erasure, no new table, no second EO identity —
  and land the override later behind this ADR. Kept as the explicit fallback if product defers item 10;
  the core flow (PR1–PR5) does not depend on it.
- **Store the override on `profiles` (e.g. a `marketing_email` column).** Rejected — ADR-0017 forbids
  marketing state on `profiles`, and it would still need its own erasure branch and verification; a
  column buys nothing over an owned table and muddies the single-owner boundary.
- **Add an email parameter to `set_my_marketing_subscription`.** Rejected — subscribing an arbitrary
  address through the self-only RPC with no ownership proof is an account-takeover / spam-relay vector;
  verification and the erasure cascade belong to a dedicated owner.
- **A standalone `BEFORE DELETE` trigger for the override.** Rejected — the ADR-0039 guard scans only
  `handle_user_deletion()`, so a sibling trigger would be invisible to the completeness check; the
  erasure must live inside the winning definition.

## Consequences

- The override extends subprocessor-owned consent to a **second identity**, so it carries a second
  erasure path, a second owned table, and a verification step — real surface area, which is exactly why
  it is isolated as PR6 and gated on all four parts landing together.
- CI enforces the erasure forever: the `REQUIRED` allowlist entry + pgTAP make "we forgot to erase the
  override" a red build, not a silent breach. This is the control that makes the critical gap
  structurally closed, not merely documented.
- Consent proof of record remains **EO + the sync row** (no local consent ledger invented); the DPIA
  and privacy notice must name EO as the subprocessor/consent register and the override as a second
  address under the same consent.
- Audit logging records `marketing_consent_changed` with field names only (no email value — the address
  is PII living in EO + the mapping table), through the existing tamper-evident `audit_log` owner.
- Expand/contract: the table add and the `p_source` widening are additive and auto-apply on merge
  (ADR-0045); rollback of the override feature is a frontend revert (flagless, §11.2) leaving the
  harmless table in place — never a migration revert.
- **Accepted downside:** the verification round-trip means a member who overrides their address is not
  immediately subscribed (they must confirm via EO). This is correct for double-opt-in and is surfaced
  in the step-e copy; it is a deliberate consequence, not a bug.

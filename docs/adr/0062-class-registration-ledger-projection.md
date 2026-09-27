# ADR 0062 — Class registration as a verified Gumroad ledger projection

- Status: Accepted
- Date: 2026-09-26
- Deciders: Morgan Denner
- Epic: Classes / Membership

## Context

Members pay for classes on Gumroad, a separate system on a separate domain. Today the platform's
only notion of "registered" is `cohort_registrations`, a self reported click log with no payment
reference, no status, and an RLS policy literally named "Users can record their registration click."
A click is not proof of payment, so it cannot gate access and it is exposed to refund fraud.

We already run a hardened Gumroad pipeline for membership: webhook ingestion into the `gumroad_sales`
ledger, a `SECURITY DEFINER` projector `compute_membership()` driven by a trigger on the ledger, a
scheduled reconcile and backfill that pull from the Gumroad API, refund and dispute clawback, and
observability. RLS forbids trusting the client. The cohort run lifecycle now exists as
`cohorts.registration_status` (ADR-0061), which gives registration state a clean source.

The load bearing requirement, confirmed with the owner: a registration is real only when a Gumroad
purchase is verified, using the same mechanism as membership, never a self reported click.

## Decision

Model class registration as a projection of the payment ledger, reusing and hardening the membership
pipeline. Combine at the ledger, mirror at the projection.

- Shared, single instance: the `gumroad_sales` ledger, the `gumroad-webhook` ingestion, the reconcile
  and backfill API plumbing, and the shared edge helpers. One money table, one ingestion path.
- Sibling, not merged: new `class_products` and `class_product_aliases` (map a Gumroad product to a
  cohort, per cohort, founding and regular audience), and a new `class_registrations` projection with
  its own `SECURITY DEFINER` projector `compute_class_registration()`. Both read the same ledger.
- Registration status derives from a verified non clawed back sale plus `cohorts.registration_status`
  (live to active, finished to completed) and `cohorts.status` (cancelled), with refund or dispute to
  refunded.
- Identity binds by a signed passthrough token (user id and cohort id, HMAC signed) carried on the
  Gumroad link and returned on the sale, with escaped email resolution as the fallback (ADR-0037).
- Access is read only by the owner via RLS, with no client write path to the registration or the
  ledger. The client Register action opens the Gumroad link and nothing more. The return redirect
  triggers a verify, it never grants.
- `cohort_registrations` is demoted to an analytics only click log that never grants access.

Reuse means harden, not trust. The membership pipeline was built for one entitlement domain and one
projector. It was never built to route one sale to more than one projector, serve a second domain,
verify a signed token, or revoke access that has no matching live sale. So Phase 0 audits it first:
characterization tests lock current membership behavior, the six invariants and contract and chaos
tests are applied to the shared ingestion, projector, and reconcile, discovered bugs are fixed (a
confirmed one already exists: `register_for_cohort_click` is called with the wrong parameter names and
silently 404s), and the shared seam is introduced (the webhook becomes a domain router, the reconcile
becomes domain aware and revokes provisioned without live sale), all with membership proven unchanged.

The guarantee this commits to is not "cannot fail." It is: no user can obtain a registration they did
not pay for or keep one after a refund, no failure is silent, and an upstream outage degrades to a
visible pending state and self heals, it never becomes a platform outage and never grants false
access. Correctness is proven by six database invariants run in CI:

1. An authenticated user cannot INSERT, UPDATE, or DELETE `class_registrations`. Attempt raises.
2. An authenticated user cannot write `gumroad_sales`. Attempt raises.
3. The same `sale_id` projected twice yields exactly one active registration.
4. A sale with `refunded_at` or `disputed_at` set yields no active registration.
5. A sale for a product not mapped to a cohort, or for an unpublished cohort, yields no registration.
6. A user reads only their own registrations, never another user's.

Operability is a first class part of the decision: bidirectional reconcile (paid but not provisioned,
and provisioned without a live sale), symptom based alerts, and an admin operations console whose
every action re-derives from the ledger or re-points a real sale and can never fabricate access.

The full plain language specification (user requirements, architecture, security, BDD scenarios, use
cases, failure and remediation table, staged plan) accompanies this ADR.

## Alternatives considered

- Trust the `cohort_registrations` click. Rejected: no money truth, refund fraud exposure.
- Build a separate class payment integration. Rejected: duplicates a hardened pipeline and doubles the
  attack surface.
- Store prices in the platform. Rejected: pricing stays on Gumroad; we only check purchased or not.
- Rewrite `compute_membership()` into one generic entitlement engine. Rejected: it puts a working,
  money critical revenue path at risk for a DRY win, and violates smallest change. Share the ledger
  and mirror the projector instead.
- Reuse the membership pipeline without an audit. Rejected: it assumes correctness we have not proven.
  Phase 0 verifies and hardens it first.

## Consequences

- Access is provable from money and cannot be forged by a client, and refunds remove access, both
  proven at the database (ADR-0024) by the six invariants plus contract and chaos tests.
- The read path is decoupled from ingestion, so a Gumroad or webhook outage does not take the platform
  down; already registered members are unaffected and new verifications show pending until they heal.
- Residuals stated honestly: verification latency, identity binding when someone pays with a
  non matching email, and custody of the webhook secret. Each fails to a safe pending or is bounded and
  detected by reconcile and audit, never into false access.
- Migrations are additive and expand contract (ADR-0026), hand applied to prod, and the schema gate
  stays red until applied (ADR-0036). The member facing surface is data gated (there is no feature flag
  system today), so it is invisible until an admin maps a product and a real purchase is verified.
- Each pull request in the program ships its own ADR, BDD scenarios, the test pyramid, the architecture
  gate, and a fresh context judge review. Phase 0 precedes all class specific work.
- Hardening the shared pipeline benefits membership too, since a fix to shared ingestion protects both
  domains.

# Braintrust telemetry: compliance-readiness enable gate (fail-safe default-OFF)

- Status: Accepted
- Date: 2026-10-10
- Amends: [ADR-0073](./0073-fleety-braintrust-observability.md) (Fleety → Braintrust observability)

## Context

Braintrust receives **verbatim member Q&A plus the DB `user_id`** — personal data sent to a US
processor. Under ADR-0073, `braintrustEnabled()` returned true whenever `BRAINTRUST_API_KEY` was present
and `FLEETY_BRAINTRUST_ENABLED` was not explicitly off (default-ON, "no dark launch"). ADR-0073 §6 itself
lists the processor **DPA, ≤30-day retention, the deletion-cascade job, and the LIA as blocking but
unbuilt**. So merely setting the API key in production would start exporting member PII before those legal
and data-lifecycle prerequisites were verified in place — the enterprise-readiness audit 2026-10 flagged
this as findings C2 (contingent critical) and H7.

## Decision

Make the unsafe state **structurally impossible**: `braintrustEnabled()` additionally requires an explicit
`BRAINTRUST_COMPLIANCE_READY` environment affirmation. Key present + flag on is **no longer sufficient** —
emission stays a fail-safe no-op (and logs a one-time warning) until a human sets
`BRAINTRUST_COMPLIANCE_READY`, which [`docs/runbooks/braintrust-prod-enable.md`](../runbooks/braintrust-prod-enable.md)
gates on: signed DPA, ≤30-day retention configured, a tested deletion-cascade (erased member ⇒ purged
turns), the LIA, and DLP verification. The kill switch (`FLEETY_BRAINTRUST_ENABLED=0`) and fail-open
observability (a Braintrust failure never affects the member turn) are unchanged.

## Consequences

- **Good:** member PII cannot flow to Braintrust in prod without an explicit, documented compliance
  affirmation; the default is safe (off); the gate is deploy-free to flip; the one-time warning makes a
  misconfiguration (key set, compliance unaffirmed) observable instead of silent.
- **Good:** aligns the code with ADR-0073 §6's own stated prerequisites.
- **Bad / cost:** this **flips ADR-0073's default-ON stance** — a deliberate behavior change. Enabling
  Braintrust now takes an extra env var (intended friction). Tests that assumed key ⇒ enabled were updated.
- **Neutral:** the deletion-cascade the runbook requires is itself still to be built (ties to the erasure
  work, audit C1); until then the gate simply keeps Braintrust off, which is the safe state.

## Alternatives considered

- **Leave default-ON, rely on process.** Rejected — "remember not to set the key early" is exactly the
  failure mode the audit caught; a config affirmation is enforceable, a convention is not.
- **Block via CI only (a guard forbidding the key).** Rejected — the key legitimately exists once compliant;
  the decision belongs at the runtime enable check, where it fails safe, not at build time.
- **Full durable-queue + deletion-cascade now.** Deferred — larger work (tied to C1 erasure). This gate is
  the safe interim that prevents premature PII export without blocking the eventual rollout.

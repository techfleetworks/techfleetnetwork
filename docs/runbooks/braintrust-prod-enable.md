# Runbook — Enabling Braintrust telemetry in production (compliance gate)

> **DRAFT for review (enterprise-readiness audit 2026-10, findings C2/H7; ADR-0073).** Braintrust
> receives **verbatim member Q&A + the DB `user_id`**. That is personal data sent to a US processor, so
> it must not switch on merely because `BRAINTRUST_API_KEY` is set. `braintrustEnabled()` now **refuses
> to emit** unless `BRAINTRUST_COMPLIANCE_READY` is affirmatively set — a fail-safe default-OFF gate.
> **Do not set that env until every box below is TRUE in production.**

## Why this gate exists

Before this change, setting the API key in prod turned on PII export with no verification that the legal
and lifecycle prerequisites were in place — and ADR-0073 itself lists the DPA, retention, deletion-cascade
and LIA as *blocking but unbuilt*. The gate makes the unsafe state **structurally impossible**: key + flag
on is not enough; a human must affirm readiness by setting `BRAINTRUST_COMPLIANCE_READY`.

## Pre-enable checklist — ALL must be TRUE

- [ ] **Signed Data Processing Agreement** with Braintrust (processor) on file, covering the data categories (free-text Q&A, `user_id`) and sub-processors.
- [ ] **Retention ≤ 30 days** configured in the Braintrust project (verify in the Braintrust dashboard, not assumed). Shorter is better.
- [ ] **Deletion cascade deployed & tested** — when a member is erased (the `handle_user_deletion` path / DSAR), their Braintrust records are deleted too. Prove it: erase a test user, confirm their turns disappear from Braintrust. (Ties to PR-4 — erasure must reach external processors.)
- [ ] **Legitimate-interest assessment / lawful basis** documented (ADR-0073 §6), and the privacy notice lists Braintrust as a processor.
- [ ] **US-residency / access controls** on the Braintrust project confirmed (per ADR-0073).
- [ ] **DLP verified** — secrets are scrubbed (`scrubSecretsOnly`); confirm no credentials/tokens appear in a sample of captured spans.
- [ ] **Kill switch rehearsed** — setting `FLEETY_BRAINTRUST_ENABLED=0` (or clearing `BRAINTRUST_COMPLIANCE_READY`) disables emission on the next isolate, no deploy. Confirm the disable path.

## To enable (only after every box is checked)

1. Set `BRAINTRUST_API_KEY`, `BRAINTRUST_PROJECT_ID` (if not the default), and `BRAINTRUST_COMPLIANCE_READY` (set it to the **DPA reference + date**, e.g. `DPA-2026-xx-xx`, so the value itself records the affirmation).
2. Confirm `FLEETY_BRAINTRUST_ENABLED` is not `0/false/off/no`.
3. Watch the edge logs: the one-time `braintrust` compliance-gate warning must **stop** appearing (it only logs while the gate is closed), and spans should begin arriving in Braintrust.
4. Record the enablement (date, who, DPA ref) in the change log.

## To disable (instant, deploy-free)

- Set `FLEETY_BRAINTRUST_ENABLED=0` **or** clear `BRAINTRUST_COMPLIANCE_READY`. Either makes `braintrustEnabled()` return false on the next isolate — emission stops, the member-facing turn is unaffected (fail-open observability).

## Enforcement

- Code: `supabase/functions/_shared/observability/braintrust.ts#braintrustEnabled` (fail-safe default-OFF).
- Test: `braintrust.test.ts` asserts key-present + compliance-unset ⇒ disabled; key + compliance-ready + flag-on ⇒ enabled; flag-off ⇒ disabled (runs in the `deno-check`/deno-test CI lane).
- Related: ADR-0073, PR-4 (erasure → external processors), `docs/sre/core-app-slos.md`.

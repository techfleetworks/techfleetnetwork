# SLIs / SLOs / Error Budgets — Core member-facing app

> **DRAFT for review (enterprise-readiness audit 2026-10, finding H4).** The only SLOs that existed
> covered the future SPF/hand-off subsystem ([`spf-handoff-slos.md`](./spf-handoff-slos.md)); the live
> ~767-user app had none. This defines the member-facing reliability targets to instrument. **100% is
> not the target** — each SLO carries an error budget and a spend policy. Latency numbers marked _(baseline)_
> are placeholders to set from a measured p95 after instrumentation, **not guessed** (same stance as the SPF doc).

## The four core journeys (what a member actually depends on)

| # | Journey | SLI (definition) | SLO (rolling 28d) |
|---|---------|------------------|-------------------|
| 1 | **Sign-in / session** | successful auth exchanges / valid attempts (exclude wrong-password 4xx) | **≥ 99.5%** availability |
| 2 | **Application submit** (project + general) | successful submits / valid submit requests | **≥ 99.5%** availability; **≥ 95%** under _(baseline)_ p95 latency |
| 3 | **Dashboard load** (authenticated landing) | loads returning data without error / attempts | **≥ 99.5%** availability; **≥ 95%** under _(baseline)_ p95 |
| 4 | **Fleety chat turn** | turns returning a non-degraded answer / valid turns | **≥ 99%** availability (degrade-on-upstream is graceful, not an outage) |

**Non-goals / exclusions:** wrong-password and validation 4xx are *not* errors (they're the system working). A confirmed upstream outage (GoTrue, Gumroad, Groq/LLM provider) that the app degrades gracefully around is excused from the availability SLO for that window — graceful degradation is not a user-facing outage.

## Error-budget policy

- **Budget burning fast → freeze feature work on that journey**, fix reliability first.
- **Budget healthy →** ship normally; the budget is permission to take risk.
- Review budget burn at each release; a journey that spends >50% of its 28-day budget in a week triggers a reliability review before the next feature merge touching it.

## Golden signals to instrument (per journey)

- **Latency** — p50/p95/p99, split success vs failure (never averages).
- **Traffic** — requests/min per journey; concurrent sessions; Fleety turns/min.
- **Errors** — by type dimension: `auth_fail | rls_denied | edge_5xx | edge_timeout | validation_reject | llm_degraded` (+ app/build version — the `/deploys/<sha>` marker already exists).
- **Saturation** — Supabase DB connection-pool headroom, PostgREST/edge concurrency, LLM-provider rate-limit headroom, Storage usage.

Plus: the `x-trace-id` correlation id (already attached by `invokeEdge`) propagated into every edge log line; a **service-overview dashboard** (signals + SLO attainment + budget burn + deploy annotations, using the existing `/deploys/<sha>.txt` markers); dependency-aware **readiness** (reports degraded when GoTrue or the LLM provider is unreachable).

## Alerting (symptom-based, multi-window burn-rate, every alert → a runbook)

- **Fast burn → page:** sign-in success < SLO over a short window; application-submit 5xx spike; dashboard error-rate spike; Fleety hard-error (not graceful-degrade) spike. (The existing `auth_email_watchdog` — "signups happening but 0 confirmation emails" — is the model: symptom-based, works when subsystems are down.)
- **Slow burn → ticket:** gradual budget erosion over the 28-day window.
- **Never page on cause metrics alone** (CPU, memory) — only on member-facing symptoms.

## Incident severities

- **SEV1** — members cannot sign in at scale; data exposure / cross-user leak; corrupted membership or application data served.
- **SEV2** — a core journey (apply / dashboard / Fleety) failing for many members past its SLO; a key upstream outage with degradation not holding.
- **SEV3** — single-journey slowness within budget; one stuck record; cosmetic issue.

Mitigate first (instant dashboard rollback for the frontend; flip the relevant kill-switch feature flag) before diagnosing. **Blameless postmortem for every SEV1/2**, action items → regression tests + an alert so the same symptom pages next time.

## Rollout (what to build to make this real)

1. Emit the per-journey error/latency events through the existing `record_event` RPC / `ops_events` sink (one event-type per journey + outcome).
2. Stand up the service-overview dashboard (Supabase + the `ops_events` aggregates) with SLO attainment + budget burn.
3. Wire the two burn-rate alerts to the existing Discord alert path (`discord-notify`), each linked to a runbook.
4. Set the _(baseline)_ latency targets from the first two weeks of measured p95.
5. Production-readiness review sign-off before calling a journey "SLO-covered."

_On-call today is one maintainer + a Discord webhook. That's honest for this stage; this doc defines the targets and the paging so a rotation/escalation can be added without redesigning the signals._

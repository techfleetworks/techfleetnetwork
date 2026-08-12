# Runbook — SPF source (GitHub Pages) outage

Skeleton (finalized in Phase A1). The upstream SPF `v1` API is static JSON on GitHub Pages —
an external dependency we don't control ([ADR-0002](../adr/0002-spf-ingestion-sync-subsystem.md)).

**Symptom:** `spf-sync` fetch failing with network / 5xx / timeout against
`techfleetworks.github.io`; freshness SLI beginning to age.

**Severity:** SEV3 while the last-good snapshot serves; escalate to SEV2 only if the outage is
long enough that stale framework data materially degrades Fleety answers.

**Key fact — this is NOT a user outage.** The snapshot design means Fleety and the
`framework_entity_v` read path keep serving the **last-good** data (graceful degradation). Do
not flip anything.

**Actions:**

1. Confirm it's upstream: `GET` the manifest URL directly; check GitHub status.
2. Silence the freshness page down to a ticket for the confirmed-outage window (a known
   upstream outage is not an actionable page — avoid alert fatigue).
3. The circuit breaker on the fetch will open and back off automatically; sync retries with
   jitter. No manual retry storm.
4. When upstream recovers, confirm the next scheduled sync succeeds and freshness recovers.

_TODO (Phase A1): breaker thresholds, how to extend snapshot-staleness tolerance if needed._

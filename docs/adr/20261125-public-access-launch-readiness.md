# 20261125 — Public access launch readiness: review a live surface, no flag to flip (C15)

- Status: Accepted
- Date: 2026-11-25
- Deciders: product owner (mdenner), engineering
- Ticket: public-access, Phase C / C15 (§9, §10)
- Related: 20261110-alerting-cannot-go-dark, 20261124-public-seo-meta-foundation (C14a),
  20261125-public-prerender (C14b). BUILD-PLAN Phase C.

## Context and problem statement

The BUILD-PLAN framed C15 as "SLOs/alerts, cache-purge-on-unpublish, runbooks; verify
behind the flag in prod, flip on." But public access is **already live** — the route
layer branches on `user` only, with no feature flag, and no `public-access` flag
exists in `src/`. It shipped incrementally as B8–B13 merged. So there is **no flag to
flip**; C15 is a retroactive production-readiness review of a running, read-only
surface, not a pre-launch gate.

## Decision

- **Treat C15 as a Production Readiness Review, not a flag flip.** Produce the review
  (`docs/public-access/PRODUCTION-READINESS-REVIEW.md`) and the operational runbook
  (`docs/runbooks/public-access.md`); the owner makes the go/no-go.
- **Define SLIs/SLOs** for the read-only public surface (availability 99.5%/30d,
  latency 95% < 800 ms/30d, field-correctness 0 leaks as a hard invariant, freshness
  bounded by deploy cadence) — targets to measure against, `documented` not yet
  `observed`.
- **Rely on the existing, proven coverage** rather than rebuild it: deploy/build
  failure paging via `main-failure-alert` (critical set includes Deploy frontend /
  edge, guarded by `check-alert-coverage`), the post-deploy `smoke-public-catalog`
  live check, the A7 allowlist guard + feed-contract + exposure SQL/smoke for §6
  correctness, and `withAuditWrapper` + edge logs for observability. The gateways are
  read-only, so there is no public-surface write to back up.
- **Name two residual gaps as non-blocking, tracked follow-ups** (not launch blockers
  for an already-live read-only catalog):
  1. **Steady-state SLO burn-rate alerting** on the live gateways does not exist — a
     platform-wide Held effort per ADR-20261110, not public-access-specific. Mitigation
     until built: edge-log inspection. First post-launch reliability item.
  2. **Prerendered-meta freshness** after an unpublish is bounded by the deploy cadence
     (the live SPA 404s immediately; only the crawler-visible `<head>` is stale for ≤1
     deploy cycle). A targeted cache-purge-on-unpublish is an optional future
     enhancement, not a blocker — building it now is disproportionate to a metadata-only,
     ≤1-cycle gap.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** confirm an already-live, read-only surface is operable; do not
  rebuild coverage that already exists; be honest about the one real gap (no live burn
  alert) without over-building for it.
- **Pattern chosen:** a Production Readiness Review backed by an evidence ledger
  (`skeptical-audit`) over the existing SRE mechanisms, plus a runbook. No new alerting
  infra, no cache-purge system, no flag machinery.
- **Candidates considered:**
  - (a) Review + ledger + runbook, accept two named residuals — chosen.
  - (b) Build SLO burn-rate alerting now — deferred: it is the platform-wide Held
    effort; scoping it to this surface alone duplicates a larger decision.
  - (c) Build cache-purge-on-unpublish now — deferred: disproportionate to a
    metadata-only, deploy-cycle-bounded gap; users never see stale content.
  - (d) Add a feature flag retroactively for a kill-switch — not chosen (owner: the
    surface is already live and low-risk; a flag adds machinery for no current need).
- **Real guarantee:** the high-severity failure modes (prod stale, gateway down at
  deploy, §6 leak) are covered and mostly `proven`; the steady-state live-burn page is
  honestly `not-assessed` with a stated mitigation. The review does not claim coverage
  it lacks.

## Consequences

- New: the PRR, the public-access runbook, this ADR. No code or schema change.
- The owner's go/no-go (in the PRR §8) is the launch decision. On "go", the two
  residuals become tracked post-launch items.
- Deferred (restated): C14c `public-feed?v=1` (AC2); the dynamic sitemap extension
  (needs migrating `generate-sitemap.ts` off anon-revoked REST); cache-purge-on-
  unpublish; and the gateway 5xx/latency burn-rate alert.

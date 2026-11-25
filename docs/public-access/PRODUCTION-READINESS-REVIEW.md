# Public Access — Production Readiness Review (C15)

> Surface: the logged-out public surface — the `public-*` edge gateways, the
> prerendered static routes, the public nav/pages (`/`, `/courses`,
> `/project-openings`, `/classes/:slug`, `/course/:courseKey`,
> `/project-openings/:id`).
> Date: 2026-11-25 · Reviewer: Claude (dev) · Decider: mdenner (owner)
> Method: the `sre-operational-readiness` skill (SLOs, four golden signals,
> symptom alerting, runbook, PRR) + the `skeptical-audit` evidence ledger.

## 0. The launch posture (read this first)

Public access is **already live in production**. It shipped incrementally as B8–B13
merged: the route layer branches on `user` only (`CoursesRoute`,
`ProjectOpeningsRoute`, `Index`) with **no feature flag**, and there is no
`public-access` flag in `src/`. So the BUILD-PLAN's "stays behind a flag until C15
flips it" was never implemented — **there is no flag to flip.** C15 is therefore a
*retroactive* readiness review of a running surface, not a pre-launch gate: confirm
it is operable, name the residual gaps, and let the owner declare it launched.

## 1. SLIs, SLOs, and error budget

Proposed targets (`documented` — no live metrics dashboard was read this session, so
these are targets to measure against, not `observed` current values). The public
surface is a **read-only catalog**, so the targets are modest and user-centered.

| SLI | Definition (measured at the edge) | SLO (window) | Error budget |
|---|---|---|---|
| Gateway availability | successful (`2xx`/`404`) `public-*` responses ÷ total | **99.5%** / 30d | 0.5% (~3.6h/30d) |
| Gateway latency | share of `public-*` responses under 800 ms | **95% < 800 ms** / 30d | the gateways already abort the client at 8 s (`getJson`), so the user-facing ceiling is bounded |
| Static-page availability | Cloudflare Pages serves the prerendered route | inherit Cloudflare Pages (≈99.99%) | — |
| Content freshness | time from an admin unpublish to the public surface reflecting it | **live: immediate; prerendered meta: ≤ 1 deploy cycle** | see §4 |
| Field correctness | §6-disallowed fields reaching anon | **0 (hard invariant)** | 0 — any breach is a SEV, not a budget |

- A `404` counts as a *successful* availability event: returning "not found" for an
  unpublished/absent item is correct behavior, not an error.
- Latency is a distribution, not a mean; measure a percentile over a window from the
  Supabase/Cloudflare edge logs, which store per-request timings.
- **Budget policy:** inside budget → ship; budget spent → the next public-access
  change is reliability work (a real symptom alert, §3) before more features.

## 2. The four golden signals — what is instrumented

| Signal | Coverage today | State | Gap |
|---|---|---|---|
| Latency | per-request timings in Supabase edge logs + Cloudflare observability (`wrangler.jsonc` `observability.logs.enabled`) | `observed` (config read) | no public-gateway p95 dashboard (platform-wide gap) |
| Traffic | request counts in the same edge logs | `observed` | — |
| Errors | each gateway's `catch` → `console.error` (edge logs) **and** `withAuditWrapper` audit events | `observed` (`public-project-openings/index.ts:7,96`) | 5xx rate not alerted on (see §3) |
| Saturation | Supabase connection pool / edge concurrency | `documented` | platform-level, not public-specific |

Correlation: edge requests carry a trace id; the frontend `invokeEdge` wrapper
threads `x-trace-id`. The public gateways are reached by **anon raw `fetch` with the
publishable key**, not `invokeEdge`, so those specific calls are correlated by the
edge log's own request id, not an app trace id (acceptable for a read-only anon path).

## 3. Alerting — symptom-based, and the honest gap

| What breaks | Alert that fires | State |
|---|---|---|
| The public **frontend** build/deploy fails (prerender throws, Vite build breaks, Cloudflare deploy fails) → prod stale/broken | `main-failure-alert.yml` (Discord + zero-secret GitHub-issue fallback), critical set includes **Deploy frontend (Cloudflare)**, **Deploy edge functions**, **CI**; guarded by `check-alert-coverage` (ADR-20261110) | `proven` (guard is a required critical-lane gate) |
| A public **gateway** is broken right after deploy | `smoke-public-catalog.mjs` post-deploy smoke (wired in `deploy-edge-functions.yml`) — the "exposure canary green before flip" | `observed` (wired) |
| A §6-disallowed field reaches anon | A7 allowlist guard + `public-feed-contract.v1.json` contract test + `security_definer_exposure_test.sql` + `edge-stack-trace-exposure` smoke | `proven` (blocking gates) |
| **A live SLO burn** (gateway 5xx rate or latency crosses the budget burn rate) **in steady state** | **none — HELD** | `not-assessed` |

**The one real residual:** there is no SLO burn-rate symptom alert on the running
gateways. This is **not** a public-access-specific gap — ADR-20261110 records it as a
platform-wide Held effort ("it does not prove ... that the SLO/burn-rate alerting the
SRE skill calls for exists (a larger, Held effort)"). For a read-only catalog already
in production, the deploy-failure alert + post-deploy smoke + exposure gates cover the
high-severity failure modes (prod stale, gateway down at deploy, data leak). A steady-
state 5xx burn would currently be caught by edge logs on inspection, not by a page.
**Recommendation:** accept for launch; track adding a gateway 5xx burn-rate alert as
the first post-launch reliability item (it is the platform SLO-alerting effort scoped
to this surface).

## 4. Freshness / cache-purge-on-unpublish

C14b prerenders each public route to `dist/<route>/index.html` at **build time**.
When an admin unpublishes a class/project:

- **Live correctness holds immediately.** The gateway filters by `status`/
  `published_at`, so an unpublished item 404s; the prerendered page's **body is the
  SPA shell**, which boots, fetches the gateway, gets the 404, and renders the
  not-found page. A human visitor sees the correct not-found at once.
- **Only the prerendered `<head>` meta is stale** (title/description/canonical of the
  unpublished item) until the next frontend build/deploy replaces `dist/`. Cloudflare
  Pages serves the new build on each deploy, so staleness is **bounded by the deploy
  cadence** (frequent — every merge to `main`).

**Decision:** accept this bounded freshness for launch rather than build a targeted
cache-purge-on-unpublish system now. Rationale: users never see stale *content* (the
SPA 404s live); only a crawler re-reading the static head before the next deploy sees
a stale title, for at most one deploy cycle. A dedicated purge (rebuild/redeploy, or a
per-route purge, triggered on unpublish) is an **optional future enhancement**, not a
launch blocker — building it now would be disproportionate to a ≤1-cycle metadata-only
gap on an already-live surface. Tracked as a follow-up.

## 5. Incident response & runbook

- Runbook: **`docs/runbooks/public-access.md`** (deploy, rollback, failure modes +
  fixes, dashboards, escalation) — written with this review.
- Severity: a §6 field-exposure breach is a **SEV1** (data confidentiality); public
  surface hard-down is **SEV2**; stale prerendered meta is **SEV3**.
- Mitigate-first: rollback = revert the frontend/edge deploy (standard TFN deploy
  rollback); a data-exposure breach = revoke/patch the gateway + rotate as needed.

## 6. Data safety

The `public-*` gateways are **read-only** (no `insert`/`update`/`upsert`/`delete` —
`observed` by grep over `supabase/functions/public-*/index.ts`). They own no data, so
there is no public-surface write to back up. The underlying tables' backup/retention/
DR are covered by `docs/runbooks/backup-and-dr.md` and `docs/runbooks/db-retention.md`
(pre-existing, out of this surface's scope). Anon has **no table grants** (A6 REVOKE);
every public read goes through a gateway allowlist.

## 7. Evidence ledger

| Claim | State | Source | Limitation |
|---|---|---|---|
| Public access is live with no flag gating it | `observed` | `CoursesRoute.tsx:22`, `ProjectOpeningsRoute.tsx:27`; 0 `useFeatureFlag` callers in `src/**/*.tsx` | code-level; not probed against the live site |
| Build/deploy failure of the public surface pages a human | `proven` | `check-alert-coverage` (critical lane) over `main-failure-alert.yml`; critical set includes Deploy frontend/edge | proves the alert is *shaped* to reach a human, not that someone is on call |
| The gateways are live after deploy | `observed` | `smoke-public-catalog.mjs` wired in `deploy-edge-functions.yml` | runs at deploy, not continuously |
| No §6-disallowed field reaches anon | `proven` | A7 allowlist guard + contract test + exposure SQL/smoke (blocking) | — |
| Gateways are read-only (no data-safety write concern) | `observed` | grep: no writes in `public-*/index.ts` | — |
| A steady-state gateway 5xx/latency burn pages a human | `not-assessed` | — HELD (platform-wide, ADR-20261110) | the one residual; mitigation = edge-log inspection until the burn-rate alert is built |
| Prerendered meta freshness after unpublish | `observed` (≤ 1 deploy cycle) | §4 analysis; gateway status filter + SPA 404 body | crawler-visible metadata only, never user-visible content |

## 8. Go / no-go

**Recommendation: GO (confirm already-launched), with two named, non-blocking
residuals.** For a read-only catalog already serving production traffic, the
high-severity failure modes are covered (prod-stale alerting, post-deploy live smoke,
proven exposure gates, read-only surface, runbook in place). The residuals —
(1) steady-state SLO burn-rate alerting is Held platform-wide, (2) prerendered-meta
freshness is bounded by deploy cadence — are tracked follow-ups, not launch blockers.

**Owner decision (mdenner):** declare public access launched? ☐ yes ☐ no — and accept
the two residuals as post-launch items, or require either before "launched."

The central SRE claim — *"we will know, and be paged, when this breaks"* — is
`observed` for the deploy/exposure failure modes and honestly `not-assessed` for a
steady-state live burn. This review does not hide that gap; it names it and its
mitigation.

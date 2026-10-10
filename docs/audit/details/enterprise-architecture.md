# Enterprise Architecture Audit — TechFleet Network

**Auditor dimension:** Enterprise architecture standards (system/software architecture, modularity,
coupling, resilience/reliability, performance & scalability, API/integration design, observability).
**Target:** `C:/Users/morga/Documents/tfn-audit` (read-only). React/Vite/TS SPA + Supabase
(Postgres/PostgREST/GoTrue/RLS) + 127 Deno edge functions. ~767 real users.
**Date:** 2026-10-09 · **Method:** static code read + grep/glob, no runtime/CI execution.

---

## Score: 79 / 100 — Band: ENTERPRISE-READY WITH GAPS (75–89)

This codebase shows **genuinely senior architectural discipline** — enforced layering, a real
resilience toolkit, trace-propagated observability, and architecture-as-code fitness functions with
meta-tests that guard the guards. It is held back from the 85+ range by **thin SLO/scalability
coverage** (one SLO doc, no load/capacity evidence, widespread `select('*')` over-fetch, pagination
not universally enforced) and an **undated 305-entry architectural backlog** with no expiry pressure.

### Weighted sub-criteria

| # | Sub-criterion | Weight | Score | Contribution |
|---|---|---|---|---|
| 1 | Layering, modularity & coupling (boundary enforcement) | 20% | 82 | 16.4 |
| 2 | Resilience & reliability patterns | 25% | 85 | 21.3 |
| 3 | Observability & operations | 20% | 78 | 15.6 |
| 4 | Performance & scalability at 10k users | 15% | 68 | 10.2 |
| 5 | API / integration design | 10% | 72 | 7.2 |
| 6 | Architecture governance & drift control | 10% | 85 | 8.5 |
| | **Weighted total** | | | **79.2** |

---

## 1 · Layering, modularity & coupling — 82

**Intended shape (decisions.md):** `UI (pages/components) → hooks (React Query) → services
(*.service.ts) → lib/integrations`. This is a real, *mechanically enforced* layered architecture,
not aspirational prose.

**Earned credit — VERIFIED:**
- **Exactly one Supabase client.** `createClient<Database>(...)` appears once in production code.
  Evidence: `src/integrations/supabase/client.ts:11` is the only non-test, non-type occurrence.
  Source: `rg -n "createClient" src` → all other hits are `types.ts` comments or `src/test/**`.
  State: VERIFIED. Limitation: grep-based; an aliased re-export would slip past (none seen).
- **Arch-gate as a fitness function.** `arch-gate.config.json` forbids `supabase.(from|rpc|storage
  |functions)` and client imports inside `src/components/**` / `src/pages/**`, forbids React/DOM/
  web-globals inside `src/services/**` / `src/domain/**`, and forbids a second client. This is the
  ArchUnit/dependency-cruiser pattern the standard calls for (software-architecture-styles.md
  "evolutionary architecture / fitness functions"). Evidence: `arch-gate.config.json:7-44`.
  State: VERIFIED (config read). Limitation: did not execute `npm run check:architecture` (CI is
  source of truth); cannot confirm the tree is currently green, only that rules + waivers exist.
- **Service layer is cohesive and domain-named** (28 `*.service.ts`: project, cohort, class,
  journey, handoff, notification, etc.) — bounded-context-ish seams, not technical-layer services.
  Evidence: `ls src/services`. State: VERIFIED.

**Deductions — the backlog is real (HIGH as a drift signal, not a correctness defect):**
- **100 waivered `UI must not access the database directly` violations** sit in
  `arch-gate.waivers.json` (components/pages reaching Supabase directly), e.g.
  `src/components/admin/ApplicantStatusDropdown.tsx`. Current live grep shows `supabase.from(` in
  **6 pages + 15 components** (`rg "supabase\.?from\(" src/pages src/components` → 9 + 30 hits).
  So the layering rule is **enforced going forward but materially violated in the grandfathered
  base** — the "UI never touches Supabase" claim is the *target*, not the current reality.
  State: VERIFIED. Limitation: waiver count (100) exceeds live violating files (~21), so some
  waivers are likely **stale** (violation already cleaned, waiver never removed) — I did not diff
  each waiver path against live content to confirm which.

Why it matters: every un-migrated component couples UI directly to schema/RLS, so a column or
policy change ripples across dozens of files instead of one service — the exact cost the layer
exists to prevent (boundary-placement question #1).

---

## 2 · Resilience & reliability patterns — 85 (strongest dimension)

This is where the codebase most exceeds a typical ~767-user app. The toolkit is broad and correct.

**Earned credit — VERIFIED (all file-read):**
- **`invokeEdge` (src/lib/edge/invokeEdge.ts)** — every browser→edge call gets: an
  `AbortController` timeout (8s default), a **single transparent retry** on transient network
  errors after 500ms, Zod body/response validation, trace-id header injection, and
  classify-before-report. `TimeoutError` distinguished from caller abort. Evidence: lines 54-187.
- **Per-function timeout registry** (`src/lib/edge/edge-timeouts.ts`, ~25 entries) makes a slow
  function's budget travel with its identity — `resolveEdgeTimeoutMs(fn, explicit, 8s)` — so a new
  caller can't re-inherit the 8s-abort bug. This is a *thoughtful* fix to a recurring class
  (ADR-0028). Evidence: `invokeEdge.ts:117`, `edge-timeouts.ts`.
- **`fetchWithTimeout` (_shared/fetch-timeout.ts)** — outbound edge calls get a hard 10s abort;
  honors a caller signal. Prevents a hung Discord webhook stalling a cron tick (the documented
  incident). Evidence: full file read.
- **`discord-fetch.ts`** — a textbook resilient wrapper: exponential backoff **with jitter**,
  429 `Retry-After` respect, retry only on 429/5xx, and a `totalBudgetMs` wall-clock ceiling so
  the server finishes before the client's `invokeEdge` timeout aborts (orphan-work prevention).
  Evidence: `_shared/discord-fetch.ts:1-60`.
- **Circuit breaker (src/lib/circuit-breaker.ts)** — a correct CLOSED/OPEN/HALF_OPEN implementation
  with rolling window, cooldown, `executeWithFallback`, and recovery reporting. Pre-configured
  breakers for Discord / edge / Firecrawl. Evidence: full file read.
- **Idempotency + rate-limit primitives** — `_shared/idempotency.ts`, `_shared/edge-rate-limit.ts`.
- **Async/queue with DLQ** — a full email pipeline: `process-email-queue` (batch size 10,
  per-lane rate limiting for auth/transactional/bulk, TTLs, consecutive-429 tracking),
  `replay-dlq-emails`, `reconcile-stuck-emails`, `email-pipeline-health`. This is the
  queue-based-async + dead-letter + bulkhead (lane isolation) pattern from the standard, applied
  for real. Evidence: `ls supabase/functions/*email*`, `process-email-queue/index.ts:8` batch const.

**Deductions:**
- **MEDIUM — Circuit breaker is narrowly adopted.** Only `discord-notify`, `explore`,
  `error-reporter` (client) and `spf-sync` + email domain (server) route through a breaker. The
  generic `invokeEdge` path does **not** use `edgeFunctionBreaker` — so a persistently-down edge
  function is retried-once-then-reported by *every* call, with no fast-fail/open state. The breaker
  exists but the main call path doesn't benefit. Evidence: `rg "circuit-breaker|CircuitBreaker"`
  shows no hit in `invokeEdge.ts`. State: VERIFIED.
- **LOW — `invokeEdge` retry is a single fixed 500ms delay, no jitter** (vs discord-fetch's full
  backoff+jitter). Acceptable for a browser SPA (per-tab, no thundering-herd risk), but
  inconsistent with the server-side wrapper. Evidence: `invokeEdge.ts:55,149-150`.
- **LOW — client-side breaker is an in-memory per-tab singleton** (correct scope for an SPA, but it
  is *not* a shared/distributed breaker; noted so it isn't mistaken for one).

---

## 3 · Observability & operations — 78

**Earned credit — VERIFIED:**
- **Trace propagation end to end.** `newTraceId()`/`withTrace()` client-side, `x-trace-id` on every
  `invokeEdge` call, and `_shared/http.ts` CORS lists the preflight header so it isn't dropped.
  Evidence: `invokeEdge.ts:99-100`, `supabase/functions/CLAUDE.md`.
- **No silent error black holes.** `report()` runs a *structural* classifier; even a dropped error
  is fed to `recordClassifiedDrop(reason, source)` into a per-minute aggregate so an outage spikes
  in System Health instead of vanishing (ADR-0031). A CI guard
  (`check-report-has-no-silent-drop.mjs`) fails closed if that branch stops recording. Evidence:
  `src/lib/observability/report.ts:43-67`. This is a notably mature observability invariant.
- **Edge audit coverage is a ratchet: 125/125 serving `index.ts` wrap `withAuditWrapper`** — every
  uncaught throw becomes an `edge_function_error` audit row with a guaranteed trace id. Evidence:
  `rg -l withAuditWrapper supabase/functions/*/index.ts | wc -l` = 125, equal to serving count.
  State: VERIFIED.
- **Structured logging** (`logger.service.ts` / `_shared/logger.ts`), a System Health dashboard
  suite (Performance/LoginHealth/Incidents/Triage tabs), and **Braintrust** AI-eval observability
  (`_shared/observability/braintrust.ts`).
- **26 runbooks** (`docs/runbooks/`) and a Groq/SPF outage playbook — real operational readiness.

**Deductions:**
- **HIGH — SLOs cover one subsystem, not the core.** The only SLO document is
  `docs/sre/spf-handoff-slos.md`. There is **no SLO/SLI/error-budget defined for the core
  user-facing flows** (auth/login, project applications, dashboard). The standard
  (observability-operations.md) wants SLOs defined *before* building, driving resilience decisions.
  Here resilience was built well but without SLO targets to size it against. Evidence:
  `ls docs/sre/` → one file; `rg "\bSLO\b|error.?budget"` hits are concentrated in SPF/handoff/email
  docs. State: VERIFIED. Limitation: SLOs could live in an external tool (Grafana/Supabase) not in
  the repo — I can only attest to what's version-controlled.
- **MEDIUM — no evidence of RED/USE metrics or p95/p99 latency instrumentation on the hot paths.**
  `p95`/`p99` appear in migrations and a couple of System Health tabs, but there's no systematic
  per-endpoint latency-percentile SLI. State: INFERRED (absence of evidence in repo).
- **LOW — no liveness/readiness distinction** for edge functions that verify real dependency health
  (serverless makes this less critical, but `email-pipeline-health` is the closest and is a cron,
  not a readiness probe).

---

## 4 · Performance & scalability at 10k users — 68 (weakest dimension)

**Earned credit — VERIFIED:**
- **Serverless edge auto-scales** (Deno/Supabase Edge) — the right style for spiky SPA traffic.
- **Displayed counts are live-derived** (`count(*)` over owning rows via RPC) — correct for data
  integrity and trivially fast at 10k rows (ADR-0050). Evidence: decisions.md §2.
- **Minimal N+1 in the service layer** — `rg "\.map\(async|for.*await" src/services` → 1 hit. Heavy
  aggregation lives in Postgres RPCs/edge, not in per-item client loops. State: VERIFIED.
- **Batch + lane-isolated async** email processing (see §2) — scales bulk sends without starving
  auth/transactional lanes.

**Deductions:**
- **MEDIUM — widespread `select('*')` over-fetch.** `rg "\.select\(\s*['\"]\*"` → **62 occurrences
  across 28 files**, including pages. Only `projects` is arch-gate-protected against it (ADR-0056/
  0065, a security fix); every other wide table is read whole in list/hot paths, inflating I/O and
  payload at scale — the exact anti-pattern in performance-scalability.md ("select only needed
  columns, especially list endpoints"). State: VERIFIED. Limitation: count includes some test/smoke
  files; the production-path subset is smaller but clearly non-trivial.
- **MEDIUM — pagination is not uniformly enforced.** `.range(`/`.limit(` appear in only ~8 services;
  there is no shared cursor-pagination convention. A list endpoint without a hard max page size is
  both a perf and a DoS concern at 10k. State: INFERRED (sampled, not exhaustive).
- **MEDIUM — single primary Postgres is the structural ceiling.** All 127 edge functions + the SPA
  share one Supabase Postgres; there's no read-replica/connection-pool strategy evidenced in-repo
  (Supabase provides pgBouncer, but pool sizing/limits aren't version-controlled here). At 10k
  concurrent-ish users the DB connection ceiling and RLS-policy evaluation cost become the first
  bottlenecks. No load-test artifact exists in the repo. State: INFERRED. Limitation: infra config
  (pooler, instance size) lives in the Supabase dashboard, outside this repo — not auditable here.
- **No capacity-planning or load-test evidence** (performance-scalability.md asks for realistic
  load tests before known peaks). `lighthouse-budget.json` covers frontend asset budgets only.

---

## 5 · API / integration design — 72

**Earned credit — VERIFIED:**
- **127 edge functions compose a shared layer** (`_shared/` owns auth, admin client, CORS,
  responses, HTML sanitization, rate-limit, idempotency) — cross-cutting concerns centralized,
  the API-gateway-ish discipline the standard wants, enforced by arch-gate rules (handler must not
  hand-roll auth/CORS). Evidence: `arch-gate.config.json:46-71`, `supabase/functions/CLAUDE.md`.
- **Idempotency keys** primitive exists (`_shared/idempotency.ts`) for side-effecting operations.
- **Event sink has one write path** — `record_event` RPC; arch-gate forbids direct `ops_events`
  inserts (ADR-0060). Evidence: `arch-gate.config.json:66-72`.
- **Typed contracts via Zod** optionally on both request and response in `invokeEdge`.

**Deductions:**
- **MEDIUM — no API versioning and no contract tests.** Edge functions are called by name with no
  `/v1/` namespace or version negotiation; the frontend↔edge contract is enforced only by *optional*
  per-call Zod schemas (api-integration-design.md wants contract-first + CI contract tests like
  Pact/schema-validation). A function changing its response shape can silently break the SPA for any
  call site that didn't pass a `responseSchema`. State: INFERRED (no version/contract-test artifacts
  found). Limitation: frontend and edge deploy from one repo, which lessens — but doesn't remove —
  the contract-drift risk, since they deploy independently (Pages vs edge-functions workflow).
- **LOW — 127 functions is a large surface** for a single small team; many are fine-grained RPCs.
  Not wrong (serverless glue), but it raises per-function ops/observability overhead and is near the
  point where a BFF-aggregation layer would reduce chattiness.

---

## 6 · Architecture governance & drift control — 85

**Earned credit — VERIFIED:**
- **75 ADRs** (`docs/adr/`) — exceptional decision-record discipline; the *why* is captured.
- **decisions.md** encodes standing rules as concrete ✅/❌ negative examples (the habit the global
  rules demand) and names the enforcing guard for each.
- **Guard-the-guard meta-testing** — every CI guard must have a committed discriminating test
  (`check-guard-has-test.mjs`, `verify-guard-test-discrimination.mjs`), guards self-declare CI lanes
  (no central matrix to conflict on), and a schema-reality gate verifies prod objects exist rather
  than trusting a ledger (ADR-0036). This is unusually rigorous drift control. Evidence:
  decisions.md §6, §"Verify reality, not a ledger".

**Deductions:**
- **HIGH (governance drift) — 305 waivers, ALL undated.** `arch-gate.waivers.json` has 305 entries
  (100 UI-DB-access, 103 inline-CORS, 93 hand-rolled-auth, 6 service-web-globals, 3 keep-in-sync),
  and **every one has `expires: ""`** — no deadline. CLAUDE.md states "the only bypass is an
  explicit, *dated* waiver," yet the entire baseline backlog is undated and marked
  `approvedBy: "baseline"`. Evidence: `node -e` count → `with expiry: 0, no expiry: 305`. This is a
  backlog with no burn-down pressure; without expiry it can persist indefinitely, which is precisely
  the drift the gate exists to fight. (Note: the prompt's estimate of ~1525 entries is inaccurate —
  the file holds **305**.) State: VERIFIED.
- **LOW — likely stale waivers** (§1): some grandfathered entries no longer correspond to a live
  violation. State: INFERRED.

---

## Ranked findings

| # | Severity | Finding |
|---|---|---|
| 1 | **HIGH** | No SLOs/error-budgets for core user flows (auth, applications, dashboard); only SPF/handoff has one. Resilience built without targets to size it. (`docs/sre/` = 1 file) |
| 2 | **HIGH** | 305 arch-gate waivers, **all undated** (`expires: ""`), contradicting the "dated waiver only" rule — an architectural backlog with no burn-down deadline. (`arch-gate.waivers.json`) |
| 3 | **MEDIUM** | Scalability unproven at 10k: 62 `select('*')` over-fetch sites, non-uniform pagination, single Postgres with no in-repo pool/replica/load-test evidence. |
| 4 | **MEDIUM** | Circuit breaker exists but the generic `invokeEdge` path doesn't use it; a persistently-down edge fn is never fast-failed. (`src/lib/circuit-breaker.ts` vs `invokeEdge.ts`) |
| 5 | **MEDIUM** | No API versioning / contract tests; frontend↔edge contract rests on optional per-call Zod only. |
| 6 | **LOW** | `invokeEdge` retry is single fixed-delay no-jitter; ~21 UI files still read Supabase directly (grandfathered). |

## Genuine strengths (credit where earned)

1. **A real, broad resilience toolkit actually applied** — timeout registry, fetch timeouts,
   exponential-backoff-with-jitter + total-budget outbound wrapper, DLQ/replay/reconcile queue with
   per-lane rate limiting, and a correct circuit breaker. Far beyond what a ~767-user app needs —
   this is enterprise-grade engineering.
2. **Observability + governance invariants that fail closed** — trace-id propagation end to end,
   125/125 edge audit-wrapper coverage, no-silent-drop error aggregation, 75 ADRs, and
   guard-the-guard meta-tests. The architecture is defended by executable fitness functions, not
   just documentation.

## Single biggest limitation of this audit

**This was a static, read-only source audit with no runtime execution.** I did not run
`npm run check:architecture` (so I cannot confirm the gate is currently green, only that rules and
waivers exist), could not profile queries, measure RLS-policy cost, run a load test, or inspect the
live Supabase infra (connection-pool sizing, instance class, read replicas, dashboard SLO/alert
config) — all of which live outside the repo. My scalability (§4) and some observability (§3)
findings are therefore partly INFERRED from the *absence* of in-repo artifacts, which could exist in
external tooling I cannot see. Several `select('*')`/N+1 counts are grep heuristics that include test
files and would be refined by executing the gate and query-level profiling against production data.

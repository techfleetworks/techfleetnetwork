# TechFleet Network — Comprehensive Test Strategy Audit

**Dimension:** Full test pyramid beyond BDD — unit/integration/e2e balance, consumer-driven
contract tests, load/perf/stress, chaos/resilience, coverage + MUTATION gates, property-based
testing, flaky-test management.
**Scope:** `C:/Users/morga/Documents/tfn-audit` (read-only). Date: 2026-10-09.
**Standard:** `comprehensive-test-strategy/SKILL.md` + 5 references; cross-checked against
`decisions.md §6` (gate integrity / discrimination) and `CLAUDE.md` Definition of Done.

**Every finding carries:** Evidence (file:line) · Re-runnable source · Evidence state
(VERIFIED | INFERRED | UNVERIFIED) · named limitation.

---

## SCORE: 43 / 100 — Band: WEAK (just above critical)

A genuinely large, assertion-rich unit base sits on real DB-integration (pgTAP) and edge-unit
(Deno) layers with a correct pyramid shape and a cross-browser e2e matrix — **and** an
exemplary suite-integrity culture (the guard-discrimination machinery). But the three pillars
this dimension is named for are largely **absent**: there is **no coverage gate** (no provider,
no threshold), **no mutation testing of product code**, and **no consumer-driven contract
tests** pinning request/response shape across the 126 edge functions. The one performance gate
(Lighthouse) is **vacuous** — `|| true` makes it incapable of failing. The strong foundation is
undercut by the missing trustworthiness gates, which is exactly what this dimension measures.

### Weighted sub-criteria

| # | Sub-criterion | Weight | Score | Weighted |
|---|---|---:|---:|---:|
| 1 | Pyramid balance & assertion quality | 0.20 | 82 | 16.4 |
| 2 | Coverage gate (threshold / diff-coverage) | 0.20 | 15 | 3.0 |
| 3 | Mutation testing (product code) | 0.15 | 35 | 5.25 |
| 4 | Contract tests (client ↔ 126 edge fns) | 0.15 | 30 | 4.5 |
| 5 | Load/perf + chaos/resilience | 0.15 | 38 | 5.7 |
| 6 | Property-based + flaky-test management | 0.15 | 40 | 6.0 |
| | **Total** | **1.00** | | **≈ 43** |

---

## 1 — Pyramid balance & assertion quality — 82 (STRONG)

The shape is correct (wide base, narrow top), not an ice-cream cone.

- **465 vitest unit/component test files.** Evidence: `Glob src/**/*.{test,spec}.{ts,tsx}`
  reported "Showing 100 of 465 matching files." Re-run: that glob. State: VERIFIED.
  Limitation: 465 is the *file* count; test-case count (`it(`/`test(`) is higher — not summed
  exactly here.
- **Assertion-rich in sampled files**, not shallow: `src/test/lib/security-extended.test.ts`
  (139 `expect`), `security.test.ts` (50), `transient-retry.test.ts` (31 expect / varied
  branches), `auth-classifier.contract.test.ts` (code-first classifier, 6 cases with real
  negative assertions, lines 17–58). Re-run: `Grep "\bexpect\s*\(" src --glob *.test.* -c`.
  State: VERIFIED (sampled, not exhaustive). Limitation: sample of ~6 files; long tail
  unverified.
- **Real integration layer exists** (middle of pyramid): 40 pgTAP DB tests
  (`supabase/tests/*.sql` — RLS/IDOR/erasure-cascade/ledger), ~72 Deno edge-unit tests
  (`supabase/functions/**/*.test.ts`), and page-render integration tests (vitest.config.ts:11
  comment confirms "integration tests render whole pages"). State: VERIFIED.
- **e2e modest & cross-browser** (46 baseline): `playwright.config.ts:31-95` defines a 14-profile
  matrix (Chromium/Firefox/WebKit/mobile/tablet/4K/slow-3G) gated behind `PLAYWRIGHT_FULL_MATRIX`,
  with chromium-only as the fast PR gate (`selectProjects`, line 118). State: VERIFIED.

**Deduction:** the **BDD gate is a weak coverage proxy** — `bdd-gate.yml:49-83` only greps whether
a changed module path is *referenced* by any file under `src/test`/`e2e`; a test that imports the
name and asserts nothing satisfies it (basename fallback at ≥6 chars is looser still). Evidence:
`bdd-gate.yml:59-78`. State: VERIFIED. This is a floor, not a real per-module coverage check.

---

## 2 — Coverage gate — 15 (CRITICAL)

The suite's execution is never measured or gated.

- **No coverage block in `vitest.config.ts`** — no `coverage`, no `thresholds`. Evidence: full
  file read (31 lines); `test:{}` has no coverage key. State: VERIFIED.
- **No coverage provider installed** — `@vitest/coverage-v8` / `-istanbul` absent from
  `package.json` devDependencies. Evidence: `Grep coverage|stryker|... package.json` → "No
  matches." State: VERIFIED. Limitation: running `vitest --coverage` would fail/prompt-install.
- **CI never requests coverage** — `gate-test` runs `npx vitest run --shard=${n}/4`
  (`ci.yml:262`) with no `--coverage`, no diff-coverage, no threshold enforcement. State:
  VERIFIED.
- **No `coverage` npm script** (`package.json:6-47`). State: VERIFIED.

Per the standard (Step 5 / quality-gates ref: "Enforce a coverage threshold, ideally on changed
lines"), this is the single largest gap. **Rank: CRITICAL.** For a ~767-user production app whose
own DoD (CLAUDE.md) demands "a reproduction that failed before and passes after," there is no
mechanism preventing new code from shipping wholly unexercised.

---

## 3 — Mutation testing — 35 (POOR, but concept earned elsewhere)

- **No Stryker / mutation tooling for product code.** Evidence: `Grep stryker|mutation
  package.json` → none; `Glob {stryker*,.stryker*}` → none. State: VERIFIED.
- **CREDIT WHERE EARNED — a real, enforced mutation gate exists, but only for CI guards.**
  `scripts/ci/verify-guard-test-discrimination.mjs` no-ops every tested guard, re-runs the smoke
  suite, and fails if any guard's test still passes (`ci.yml:225-227`; `decisions.md:288-290`).
  This is genuine mutation testing of the guard fleet — advanced and uncommon. State: VERIFIED.
  **Limitation:** it is pointed exclusively at `scripts/ci/*` guards, **not** at the 465 product
  tests or any business logic. The 139-assertion security module, the auth classifier, the
  retry/timeout logic — none have mutation coverage. **Rank: HIGH** (the discrimination culture
  proves the team *can* do this; it simply hasn't aimed it at product code).

---

## 4 — Consumer-driven contract tests (client ↔ 126 edge functions) — 30 (POOR)

The frontend calls edge functions via `invokeEdge`; nothing pins the **request/response shape**
contract across that seam.

- **No Pact / consumer-driven runtime contracts.** Evidence: `Grep pact package.json` → none;
  no Pact broker / `can-i-deploy` in any workflow. State: VERIFIED.
- **The files named `*.contract.test.ts` are NOT service contracts.** Two classes, both verified
  by reading:
  1. *Internal logic contracts* — e.g. `auth-classifier.contract.test.ts` pins a pure function's
     mapping (good unit tests, lines 1-59). State: VERIFIED.
  2. *Static source-regex structural checks* — `src/test/edge-cors-x-trace-contract.test.ts`
     greps 15 edge functions' `index.ts` for an `import { corsHeaders } from "../_shared/http.ts"`
     pattern (lines 37-47). This pins the **CORS preflight header allowlist** only — a narrow but
     real client↔edge compatibility slice (the `x-trace-id` header the client always sends).
     State: VERIFIED.
- **The gap:** no test asserts that an edge function's JSON **response body / status contract**
  still matches what the client consumer expects. A provider changing a field name or status code
  would not redden any contract test; it would surface only if an e2e happens to traverse it.
  **Rank: HIGH.** Partial credit (30, not lower) for the CORS-header contract + the
  `check-edge-cors-trace.mjs` mechanical enforcement it references.

---

## 5 — Load/performance + chaos/resilience — 38 (MIXED)

**Performance — the one gate is vacuous:**
- `lighthouse.yml:34` ends `lhci collect ... || true` and `lighthouse.yml:39` ends
  `lhci assert ... || true` — **the job can never fail.** Assertions are `performance=warn`
  (not error), and it runs against the live `https://www.techfleet.network/` production URL
  rather than the PR build (lines 26-33, `numberOfRuns=2`). Evidence: full file read. State:
  VERIFIED. This is precisely the "false green" class `decisions.md §6` forbids for guards —
  ironically un-applied to the perf gate. **Rank: HIGH.**
- **No k6 / Artillery / Locust** load/stress/soak/spike tests. Evidence: `Grep k6|artillery`
  → none. State: VERIFIED. Limitation: at 767 users the *risk* is currently low, but there is
  no baseline to catch a regression, and no stated SLO.

**Chaos/resilience — partial, client-side only (CREDIT EARNED):**
- Resilience *patterns* are tested at unit level: `transient-retry.test.ts`, `db-retry.test.ts`,
  `rpc-with-timeout.test.ts`, `edge-timeouts.test.ts`. State: VERIFIED (files exist).
- Client-side graceful-degradation is tested at e2e: `offline-survival.e2e.ts` (drops the
  network mid-session and asserts the shell still renders — read in full, lines 11-29),
  `push-sw-graceful-degradation`, `suspense-426-retry`, `stale-chunk-recovery`,
  `web-vitals-beacon-failure`. State: VERIFIED. The edge `techfleet-chat/degrade.test.ts`
  (ADR-0044) tests provider-failure fallback.
- **Gap:** no true fault injection in a prod-like environment — no Toxiproxy/latency injection,
  no dependency-severing against a running stack, no instance-kill, no game days. Evidence: no
  such tooling/workflow found. State: VERIFIED (absence). **Rank: MEDIUM** (low priority at this
  scale, but "resilience you haven't injected failure against is unproven" per the standard).

---

## 6 — Property-based testing + flaky-test management — 40 (POOR/PARTIAL)

**Property-based — absent:**
- No `fast-check`. Evidence: `Grep fast-check|import fc` → only false positives (substring
  "coverage"/"retries" in unrelated files). State: VERIFIED. Prime candidates exist and use
  example-based tests only: parsers/serializers `parse-explore-recommendations`,
  `opening-category`, `normalize-query`, `ua-parse`, `email-domain-validation`, `countries`,
  `pdf-to-markdown`. **Rank: MEDIUM.**

**Flaky-test management — partial:**
- Playwright `retries: isCI ? 1 : 0` (`playwright.config.ts:146`). State: VERIFIED. A single
  retry *masks* intermittent failures without a tracking/quarantine system — the standard's named
  anti-pattern ("quarantine is a hospital, not a graveyard"). Mitigated by `trace/screenshot/video
  retain-on-failure` (lines 161-163) which aids diagnosis.
- **Proactive flake-prevention guard:** `check-no-unguarded-networkidle.mjs` (`ci.yml:164-165`)
  blocks a known 45s-hang flake class in e2e. `check-no-prod-supabase-in-tests` keeps the suite
  off the live project (`ci.yml:160-161`). State: VERIFIED — credit.
- `vitest testTimeout: 15000` with a documented import-cost rationale (`vitest.config.ts:10-15`) —
  reasonable, explicitly "without masking genuine hangs." State: VERIFIED.
- **Gap:** no documented flaky-rate tracking, no quarantine lane, no flaky dashboard, no
  suite-runtime metric. Evidence: `Grep flaky|quarantin *.md` → only prose mentions, no process.
  State: VERIFIED. **Rank: MEDIUM.**

---

## Cross-cutting STRENGTH — suite-integrity / gate-discrimination culture (exemplary)

This is the dimension's standout, and it is real: `decisions.md §6` mandates every CI guard
fail-closed, emit an evidence line, be pinned by a committed discriminating test, and actually
run. Enforced by a stack of meta-guards wired into the required `gate`:
`verify-guard-test-discrimination.mjs`, `check-guard-has-test.mjs`, `check-ci-guard-integrity.mjs`,
`check-guards-wired.mjs` (`ci.yml:197-227`; ADR-0022/0023). Evidence: VERIFIED. This is
meta-testing maturity most production teams never reach — **but it governs the CI-guard fleet, not
the product test suite.** The tragedy of this audit is that the exact discipline (mutation/
discrimination, no-false-green) the team applies rigorously to its guards is **not** applied to
the 465 product tests, and the Lighthouse gate violates its own §6 rule with `|| true`.

---

## Ranked findings

| Rank | Finding | Evidence | State |
|---|---|---|---|
| CRITICAL | No coverage gate — no provider, no threshold, no diff-coverage; CI never measures execution | vitest.config.ts (no coverage block); package.json (no provider); ci.yml:262 | VERIFIED |
| HIGH | Lighthouse perf gate is vacuous (`|| true` on collect **and** assert; warn-only; vs prod URL) — cannot fail | lighthouse.yml:34,39 | VERIFIED |
| HIGH | No mutation testing of product code (the discrimination gate covers only CI guards) | Grep stryker→none; ci.yml:225 | VERIFIED |
| HIGH | No consumer-driven contract tests on request/response shape across 126 edge fns | Grep pact→none; edge-cors-x-trace-contract.test.ts (CORS-only) | VERIFIED |
| MEDIUM | No load/stress/soak/spike tests; no perf baseline or SLO | Grep k6\|artillery→none | VERIFIED |
| MEDIUM | No property-based testing for parser/serializer logic | Grep fast-check→none | VERIFIED |
| MEDIUM | No true fault-injection chaos (client-degradation e2e only) | no Toxiproxy/FIS/game-days | VERIFIED |
| MEDIUM | Flaky management is retries:1 with no tracking/quarantine process | playwright.config.ts:146 | VERIFIED |
| LOW | BDD gate is a weak grep "is-referenced" proxy, not a real coverage check | bdd-gate.yml:59-78 | VERIFIED |

## Top strengths (credit)

1. **Large, assertion-rich, correctly-shaped pyramid** — 465 unit/component files on real pgTAP
   (40) + Deno edge-unit (~72) integration layers + a 14-profile cross-browser e2e matrix.
2. **Exemplary gate-discrimination / no-false-green culture** (decisions.md §6 + the meta-guard
   stack) — real mutation testing of guards; proactive flake-prevention guards. It just isn't
   aimed at product code or coverage.

## Biggest limitation of this audit

Static/read-only: the suite was **not executed**, so coverage %, true per-case counts, mutation
scores, and actual flaky rate are inferred from configuration and sampled source, not measured.
Assertion-quality was sampled (~6 files of 465), so the long tail of test quality is UNVERIFIED.
No CI run history was available to quantify real flakiness.

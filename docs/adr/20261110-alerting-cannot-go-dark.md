# ADR 20261110 — The main-failure alert cannot go dark

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: re-audit 2026-10-30 (RH4 / SRE-1..3 / REL-1), PRD v1.2 D-24/P-20, the SRE
  operational-readiness skill (symptom-based, actionable alerting)

## Context

A failure of a production-critical workflow on `main` is a **user-facing symptom** — prod may be stale
or broken (a silent `react-router` build break and an 11-day `bun.lock` freeze are the incidents that
motivated the original alert). `.github/workflows/main-failure-alert.yml` existed to make those loud,
but the 2026-10-30 re-audit found it could go **dark**:

- **It depended on one secret.** When `DISCORD_ALERT_WEBHOOK` was unset (and it was — the re-audit
  observed the secret absent and `main-failure-alert`'s last five runs all `failure`), the workflow
  degraded to a red `::error::` annotation on a run that nobody watches. A red annotation is not a page.
- **It watched only a subset.** It fired on `CI`, `Deploy edge functions`, and `Config preflight`, but
  not on `Deploy migrations`, `Deploy frontend (Cloudflare)`, or `Verify deploy` — the workflows whose
  failure most directly means production is broken or stale.

Evidence state: the dark-on-unset behaviour and the narrow watch list are `observed` (the workflow
source was read this session); the secret being unset on prod is `reported` from the re-audit (no
dashboard access here).

## Decision

Make the alert reach a human through **two independent channels**, and keep that guarantee enforced.

1. **Primary channel — Discord webhook** (`DISCORD_ALERT_WEBHOOK`), unchanged and fast.
2. **Fallback channel — a GitHub issue** opened with the built-in `GITHUB_TOKEN` (`issues: write`), which
   needs **no secret**. If the webhook is unset **or** the POST fails, the workflow opens (or appends to)
   an issue labelled `main-failure`, so repo watchers are notified. Only if **both** channels fail does
   the step exit non-zero, so the run itself is the last-resort signal.
3. **Bounded dedupe (not forever).** The fallback reuses the **one open issue per workflow** — commenting
   instead of spamming new issues — and **resets when that issue is closed**. This is the deliberate
   contrast to the edge paging path that deduped a fingerprint forever (SRE-2): once an incident is
   resolved and its issue closed, the next failure opens a fresh alert.
4. **Widened watch list** to the full production-critical set: `CI`, `Deploy edge functions`,
   `Deploy frontend (Cloudflare)`, `Deploy migrations`, `Config preflight`, `Verify deploy`.
6. **Alert on a hang, not just an outright failure.** The job fires on `failure`, `timed_out`, **and**
   `startup_failure` (a hung Deploy/Verify run reports `timed_out`, which is exactly "prod stale/broken").
   `cancelled` is excluded on purpose — a cancel is usually intentional or a superseded run, so paging on
   it is noise (SRE: don't page on noise).
7. **A blocking coverage guard** — `scripts/ci/check-alert-coverage.mjs` (`ci-lane: critical`) — binds the
   policy to the mechanism. It fails (exit 1) if a critical workflow loses alert coverage, if a watched
   name matches no real workflow `name:` (a typo'd entry that silently never fires — the dark-alert
   failure mode), if the `issues: write` permission or a **live** `gh issue create` fallback is removed (a
   commented-out one does not count), or if the trigger narrows back to failure-only (dropping
   `timed_out`); it fails closed (exit 2) on a missing dir / missing alert file / zero workflows. The
   critical set lives in both the workflow and the guard's `DEFAULT_CRITICAL`, kept in lockstep.

Design bar held: prevent by construction → fail-closed CI gate → a discrimination test that reddens on
revert (`src/test/smoke/check-alert-coverage.smoke.test.ts`, AC-001..AC-010: coverage gap, dangling
watch entry, missing `issues: write`, missing/commented-out fallback, no block-list, failure-only
trigger, and the two fail-closed paths).

## Alternatives considered

- **Just require the webhook secret.** Rejected — "set this secret or alerts are silent" is exactly the
  single point of failure that went dark; the owner-set secret stays Held, and the alert must work
  without it.
- **Email / PagerDuty / a new edge function.** Rejected for now — more secrets and infra; a GitHub issue
  is a zero-secret channel already wired to notifications. Revisit if issue noise proves inadequate.
- **Open an issue on every failure (no dedupe).** Rejected — would bury the signal; bounded per-open-issue
  dedupe keeps one actionable thread per workflow.
- **Dedupe forever by fingerprint.** Rejected — that is the SRE-2 anti-pattern (a resolved incident's
  fingerprint suppresses the next real one). Dedupe resets on close.

## Consequences

- When the Discord webhook is unset or failing, main failures now surface as GitHub issues (and repo
  watchers are notified) instead of vanishing. The two-channel + widened-coverage behaviour is enforced
  per-PR by `check-alert-coverage` (green on the tree this session: 6 critical watched, all resolve,
  fallback present — `observed`).
- Adding a new production-critical workflow is a two-line change in lockstep (the workflow's watch list
  **and** `DEFAULT_CRITICAL`); the guard reds if those two **declared** lists drift from each other. It
  cannot, on its own, know a brand-new critical workflow that was added to *neither* list — that still
  rests on review (a declared-policy guard's inherent limit).
- **Still Held (owner, not shippable in code):** actually setting `DISCORD_ALERT_WEBHOOK` and
  `SUPABASE_DB_PASSWORD` needs dashboard access. Until then, the GitHub-issue fallback is the live channel.
- **Limitations (honest — the title is a goal, not an absolute):**
  - The guard proves the alert is *shaped* to reach a human for the covered conclusions and declared
    critical set; it does not prove a human is on call or that the issue's notifications are actually
    watched, nor that the SLO/burn-rate alerting the SRE skill calls for exists (a larger, Held effort).
  - The **last resort when BOTH channels fail is `exit 1`** — a red run on the alert workflow itself,
    which is *not* in its own watch set, i.e. the same kind of unwatched red this ADR set out to replace.
    It is a bounded backstop (needs Discord unset/broken *and* issue creation failing), not a page.
  - **Concurrent dedupe race:** two runs of the same workflow failing near-simultaneously can each see
    "no open issue" and open two issues for one incident (`gh` has no atomic search-or-create). Self-heals
    on the next failure; accepted rather than adding locking.
  - A missed page should be treated as a missing entry in `DEFAULT_CRITICAL`, a missing conclusion, or a
    missing channel, and added — the escaped-defect loop, not a reason to distrust the gate.

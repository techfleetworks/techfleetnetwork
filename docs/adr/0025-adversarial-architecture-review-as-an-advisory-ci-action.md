# ADR 0025 — Adversarial architecture review as an advisory CI Action

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: ADR-0022 (every guard tested); ADR-0023 (guard tests must discriminate; it _named_ this gap); ADR-0024 (prove at the owning layer); `AGENTS.md`; the `judge-arch` skill; `scripts/ci/llm-arch-review.mjs`; `.github/workflows/llm-arch-review.yml`.

## Context

The repo has two quality layers: **mechanical gates** (arch-gate, the guard coverage + discrimination gates, the meta-guard, bdd-gate) that run on every PR and block merge, and an **adversarial review** (`judge-arch` — a skeptical read of the diff against the four questions) that catches semantic problems a regex can't: a plausible-but-wrong finding, a misplaced boundary, a swallowed error.

`judge-arch` has always been **agent-run convention**: it runs because an agent follows `AGENTS.md`, not because CI forces it. So a **human-opened PR**, or an agent that skips the playbook, gets the mechanical gates but no adversarial review. ADR-0023 named closing this as the last convention-only step. The mechanical gates already convert the single highest-value thing judge-arch keeps catching (vacuous guard tests) into a deterministic gate; what remained was the _general_ adversarial read on every diff, regardless of who opened the PR.

## Decision

Add **`llm-arch-review`** — a CI Action that runs the four-questions rubric on every PR's diff via an LLM and posts the findings as a single, upserted PR comment.

1. **Advisory first (observe, then block).** The job is informational: it always exits 0 and only comments. It is promoted to blocking by setting `ENFORCE: "1"` in the workflow, and even then it fails **only** when the model reports findings — never on a skip or an API/reachability error (a review we couldn't run is not a violation). This mirrors ADR-0019/0020's rollout discipline.
2. **Cost-bounded.** The static rules (`AGENTS.md` + `decisions.md` + the rubric) are sent as a `cache_control` prefix so repeated runs pay ~10% of that input; the diff is capped (`LLM_REVIEW_MAX_DIFF_CHARS`, default 60k) with truncation disclosed, so a huge PR can't spike the bill. Expected cost is a few cents per PR; GitHub Actions minutes are free (public repo).
3. **Fork-safe.** It uses the standard `pull_request` event, **not** `pull_request_target` — so untrusted fork code never runs with secrets. On a fork PR the API key is withheld and the script self-heals to a skip; the local `judge-arch` convention still covers those.
4. **Single upserted comment.** It edits its previous marker comment instead of posting a new one each push — no comment spam.
5. **Testable core despite being LLM-backed.** Per `verifiable-quality-gates`, the deterministic parts (request assembly with the cache anchor, comment framing, findings detection) are unit-tested, and the script exposes test-only seams (`LLM_REVIEW_FIXTURE`, `LLM_REVIEW_DIFF_FILE`, `--dry-run`) so its wiring is exercised without a live API. It is advisory, not a pass/fail guard, so it is intentionally outside the guard coverage/discrimination gates.

## Considered options

- **(chosen) An advisory LLM review Action, rules-cached, diff-capped, fork-safe, upsert comment.** Closes the gap for human PRs deterministically-scheduled (it always runs), at a few cents/PR, without risking a noisy hard-block before the team trusts it.
- **Keep judge-arch convention-only.** Rejected — it is skipped exactly when it matters (human PRs, or under deadline pressure), which is the whole gap ADR-0023 named.
- **Make it blocking from day one.** Rejected as the _initial_ state — an unproven reviewer that hard-fails PRs trains people to ignore or disable it. `ENFORCE=1` is a deliberate later promotion once its signal is trusted, exactly like the migrations-applied gate.
- **`pull_request_target` so fork PRs also get reviewed.** Rejected — it runs with repository secrets in the context of untrusted fork code, a well-known token-exfiltration foot-gun. Fork PRs skip; that is the safe trade.
- **A second mechanical (non-LLM) rule instead.** Already covered where possible — the mechanical gates exist. This layer is specifically for the _semantic_ judgments a regex can't make.

## Consequences

- **Positive:** every PR — human or agent — now gets an adversarial architecture read, posted where the discussion is. The rubric lives in one place (this script + `AGENTS.md`) and is applied uniformly. Cost is bounded and observable; the block switch is one line when ready.
- **Negative / trade-offs:** it depends on an external model API and an `ANTHROPIC_API_KEY` secret (absent → transparent skip, never a false green). LLM review is non-deterministic — two runs can word findings differently — which is why it is advisory and why the deterministic mechanical gates remain the actual merge guarantee. Fork PRs are not reviewed by CI (covered by the local convention). It reviews the diff _after_ it is written, so it complements, and does not replace, an agent running `judge-arch` while shaping the change.

## Confirmation

`src/test/smoke/llm-arch-review.smoke.test.ts` pins the deterministic core and the seam-driven dry-run/skip paths. The workflow runs on every PR to `main`; a clean change yields an `ARCH-REVIEW: PASS` comment, a change with a boundary/ownership/dependency/error-handling problem yields itemized findings. Promotion to blocking is the `ENFORCE: "1"` switch, tracked in `AGENTS.md`.

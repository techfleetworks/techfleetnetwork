# AGENTS.md — how we keep techfleetnetwork correct

This file is the standing instruction for **every** coding agent and teammate on this repo
(Claude Code, Cursor, Copilot, a human in a hurry). Read it before you change code. It exists
so the adversarial, discrimination-first quality bar we hold is inherited automatically — you
do not have to rediscover it. It complements `decisions.md` (the specific rules) and the global
`CLAUDE.md` (the org engineering rules); where they overlap, all three agree.

## The one idea: catch the _invisible_ failure

Most damage here does not come from code that obviously breaks. It comes from **silent** failure —
a guard that stopped catching what it was built to catch, a test that asserts nothing, an auth
check that trusts an unsigned token, an error that is swallowed. All of these ship **green**.
Our whole quality system is built to make the invisible visible and then to make it _mechanically
impossible to reintroduce_. Two layers do this:

- **Mechanical gates (CI, blocking, deterministic).** They run on _every_ PR regardless of who
  or what opened it. If one is red, nothing merges. These are the guarantee.
- **Adversarial review (judge-arch, LLM, agent-run).** It catches the _semantic_ problems a regex
  cannot — a plausible-but-wrong finding, a vacuous test, a misplaced boundary. It is powerful but,
  today, a **convention**: it runs because the agent follows this file, not because CI forces it.
  So: **the goal is always to turn what judge-arch keeps catching into a mechanical gate.** The
  discrimination gate (below) is exactly that move, made for vacuous tests.

## Before you call anything "done"

1. **Run the four questions** on your diff (from `CLAUDE.md`): boundary placement, data ownership,
   dependency direction, error handling. Business logic is not in handlers/components; every fact
   has one writer; domain code does not import web/UI; every `catch` recovers, retries, or reports.
2. **Mechanical gate green.** `node scripts/ci/arch-gate.mjs --changed` exits 0, and the full CI
   `gate` is green. If your change is architectural and no rule covers it, _add_ the rule (see
   `arch-encode`) — enforcement, not prose.
3. **Adversarial review.** Run the `judge-arch` skill on the change (fresh context, four questions).
   It must return PASS or every finding must be explicitly waived. **This is mandatory** — it is the
   step that has caught real false positives in this codebase (comment-mentions counted as coverage,
   cross-credit in a coverage guard). Do not skip it because the mechanical gate is green; they catch
   different things. (Human PRs without an agent won't get this automatically — see "Open gap".)
4. **An ADR** for any architecturally-significant decision (`architectural-decision-records`),
   committed with the code.

## Guards and their tests — the discrimination rule

CI "guards" live in `scripts/ci/` and enforce our invariants (auth/JWT/OAuth boundaries, the email
architecture, single-writer ownership, no swallowed errors, migrations applied, …). A guard is only
as trustworthy as _its own_ detection, so:

- **Every guard has a committed test** that actually runs it — enforced by
  `scripts/ci/check-guard-has-test.mjs` (blocking). A new guard fails CI unless a `*.test.ts`
  execs it. (See ADR-0022.)
- **Every guard's test must DISCRIMINATE — no vacuous tests.** A test that execs the guard but
  asserts nothing meaningful (only happy-path `→ 0`) would let a _broken_ guard ship green. This is
  now mechanical: `scripts/ci/verify-guard-test-discrimination.mjs` (blocking) replaces every _tested_
  guard with a no-op and requires each guard's test to **fail**. A test that still passes against a no-op
  guard is vacuous and CI blocks it. (See ADR-0023.)

  Prove it yourself in one line: break a guard's detection (e.g. change a regex to match nothing)
  and its committed test must go **red**. If it stays green, the test is fake — fix the test, not
  the guard.

- **A guard test must be faithful and fail closed.** The violation fixture must reproduce the
  guard's _real_ pattern (so removing the guard's detection flips the test to green→fail). Assert
  the fail-closed exit codes too (missing root, zero-scan). Run the guard against throwaway fixtures
  via `src/test/smoke/support/guard-fixture.ts`; keep the `execFileSync(GUARD)` in the test file with
  a local `const GUARD = resolve(...)` (that is how `check-guard-has-test` credits it).

- **The ratchet only shrinks.** `scripts/ci/guard-test-allowlist.json` lists guards that predate the
  test requirement. You may **remove** a name (once it has a real test) — never add one.

## Gate-integrity rules (a check must never lie)

Every guard must **fail closed** (missing input / internal error / zero-scan → non-zero, never a
silent `exit 0`), **emit evidence** (what it inspected + a count) on success, and be free of the
false-green defect classes (`exit(0)` in a `catch`, `new URL().pathname` — use `fileURLToPath`,
hand-rolled directory walks — use the `_guard.mjs` harness). This is enforced by the meta-guard
`scripts/ci/check-ci-guard-integrity.mjs` (blocking) and written in `decisions.md §6`.

## When you find a recurring mistake, encode it

Don't just fix it — turn it into a durable, enforceable, tested rule (`arch-encode`): a negative
code example in the file where the code lives, wired into the mechanical gate, proven by a test.
That is how a lesson survives the session it was learned in. This file, `decisions.md`, and the
guards are the accumulated result.

## Adversarial review in CI (the former "open gap")

judge-arch (the adversarial four-questions review) began as **agent-run convention** — a
human-opened PR got the mechanical gates but not the adversarial review. That gap is now closed by
the **`llm-arch-review` Action** (`.github/workflows/llm-arch-review.yml` →
`scripts/ci/llm-arch-review.mjs`): it runs the same rubric on every PR diff and posts an advisory
comment, so a review happens whether or not an agent opened the PR (see ADR-0025).

It is **advisory** today (informational; never fails the build) following the repo's "observe, then
block" ratchet — promote it to blocking by setting `ENFORCE: "1"` in the workflow once the team
trusts its signal. It is not a substitute for an agent running `judge-arch` locally before "done":
the Action reviews the diff after the fact, the agent's review shapes the change as it is written.
Fork PRs (no secret access) self-skip; the local `judge-arch` convention still covers those.

## Environment notes for agents

- Bash may be fork-broken on Windows dev machines — prefer the PowerShell tool there.
- PowerShell here-strings for `git commit` are flaky — use `git commit -F <file>`.
- `deno` is available for edge-function type checks; `typescript` (devDep) backs the AST-based
  guards. Never merge with a red required check; the owner merges PRs.

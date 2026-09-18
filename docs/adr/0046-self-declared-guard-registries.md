# ADR 0046 — Guard exemptions self-declare in their own file; no central registry to conflict on

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `scripts/ci/check-ci-guard-integrity.mjs` (the meta-guard changed here) + `src/test/smoke/check-ci-guard-integrity.smoke.test.ts`. First in a series that removes the per-merge conflict churn on central shared lists (follow-ups: glob-derive the `ci.yml` guard matrices; split `decisions.md` into fragments; collision-free ADR ids; drop-only schema baseline). Skills: `arch-encode`, `enterprise-architecture-standards`, `release-deployment-safety`.

## Context and problem statement

The hardening program adds CI guards constantly, and two open PRs at a time reliably **conflicted on the same central lists** — most often `check-ci-guard-integrity.mjs`'s `BESPOKE_DIR_READERS` Set (every guard that legitimately reads a directory without the shared harness had to be _added to this one Set_). Two guard PRs → same hunk → merge conflict, every time. This session hit it repeatedly (rebasing #345, #352, #358 past each other). The list's _content_ was fine; the problem was its _shape_: one file that every guard PR must edit is a structural conflict magnet.

The same anti-pattern lives in several places (the `ci.yml` guard matrices, `decisions.md`, sequential ADR numbers). This ADR fixes the highest-frequency instance and sets the pattern for the rest.

## Decision drivers

- **Remove the conflict structurally, not by rebasing faster.** A shared central list that every PR edits will always conflict; the fix is to make the declaration _local to the thing being declared_.
- **Keep the exemption reviewed and on-record.** Self-declaration must still be a visible, greppable, reasoned opt-out — not a silent bypass.
- **No weakening of the meta-guard.** A real hand-rolled directory walk with no exemption must still be caught (fail-safe).

## Considered options

1. **Keep the central `BESPOKE_DIR_READERS` Set.** Rejected: it _is_ the conflict source.
2. **Per-guard self-declared marker (chosen).** A guard opts out of the harness requirement by carrying `ci-guard-integrity: bespoke-dir-reader — <reason>` in its own source; the meta-guard scans each guard file for the marker instead of consulting a central Set. Adding a bespoke guard now edits only that guard's file → two such PRs never touch the same lines.
3. **Auto-derive "bespoke" heuristically** (e.g. "reads a directory but also queries an API"). Rejected: unreviewable and fragile — the whole point is a _reviewed, explicit_ exemption.

## Decision outcome

**Chosen: Option 2.** `check-ci-guard-integrity.mjs` replaces the `BESPOKE_DIR_READERS` Set with a `BESPOKE_MARKER` regex; the 14 previously-listed guards now each carry the marker (with their reason) in their own file. The class-3 (hand-rolled walk) check exempts a guard iff it self-declares. The fix message now tells authors to self-declare in their own file.

The marker must be the **leading content of a comment line** and **carry a `— <reason>`** — matched by an anchored, multi-line regex, not a raw substring. This mirrors the positional scoping of the pre-existing class-1 `ci-guard-integrity-ok` opt-out and closes the false-green hole a raw match would open: a guard that merely _mentions_ the marker string — in a string literal or help/fix message (code), mid-sentence in a "do NOT" example, or in a docblock that _documents_ the format (the most concrete case: a future guard whose job is to _validate these markers_) — does not thereby self-exempt from the hand-rolled-walk check. Only a deliberate, reviewed declaration does; a marker-validating guard keeps the literal in code, where it is correctly ignored.

## Consequences

**Good**

- The `BESPOKE_DIR_READERS` merge-conflict class is dead: a new bespoke guard is a one-file change; two guard PRs no longer collide here.
- The exemption stays reviewed and greppable — it moved _closer_ to the code it describes (the guard's own rationale), which is where it belongs.

**Bad / accepted**

- The marker is a string convention; a typo means the guard is (correctly, fail-safe) flagged until fixed. Accepted — fail-safe, and the smoke test pins both directions.
- One-time cost: 14 guards each gained a marker line. Accepted — a single migration, no recurring cost.
- This fixes only _one_ of the central-list conflict sources; the `ci.yml` matrices, `decisions.md`, and ADR numbering remain (sequenced follow-ups). Accepted — ship the highest-frequency win first, incrementally and reviewably, rather than one risky megablast.

## Confirmation

- `src/test/smoke/check-ci-guard-integrity.smoke.test.ts` MG-007 (a readdir guard _with_ the marker → exit 0) and MG-004 (a readdir guard _without_ it → exit 1) prove the marker is load-bearing; MG-010 confirms the real repo (all 14 marked) passes. `check-guard-has-test` + `check-guards-wired` stay green.
- The anchored (single comment line, leading content) + required-reason scoping is pinned against evasion: MG-011 (marker only inside a string literal → still exit 1), MG-013 (marker mid-sentence in a "do NOT" comment → still exit 1), and MG-014 (marker split across two comment lines → still exit 1) prove a mere mention or a malformed/split marker can't self-exempt; MG-012 (a bespoke marker with no `— <reason>` → still exit 1) proves the opt-out must be explained.

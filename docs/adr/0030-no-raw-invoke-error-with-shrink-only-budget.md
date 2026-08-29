# ADR 0030 — `no-raw-functions-invoke` is `error` with a shrink-only grandfather budget

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: ADR-0028 (edge-error shape has one owner — this is its _structural_ completion); ADR-0027 (codemod toolkit, used to migrate the mechanical batch); the hardening plan's Phase 1; `scripts/lint/eslint-plugin-no-raw-functions-invoke.mjs`, `scripts/lint/raw-invoke-grandfather.json`, `scripts/ci/check-raw-invoke-budget-shrinks.mjs`; `decisions.md §4/§8`.

## Context

ADR-0028 established that a regex guard cannot make error-shape coupling impossible (intermediate-variable / aliased access is invisible to it), and named the real structural mechanism: **`no-raw-functions-invoke = error`**. Once every call goes through `invokeEdge`, no consumer ever receives a raw supabase error, so nothing can couple to its shape — regardless of coding style. The rule was `warn` with 80+ pre-existing raw `supabase.functions.invoke` sites, so it couldn't simply be flipped without breaking the build.

The goal from the owner: make it **structurally impossible for any developer to break** — not merely discouraged.

## Decision

Flip the rule to `error` now, behind a **count-based, shrink-only grandfather budget**, so new couplings are impossible while the existing ones burn down:

1. **Count-based budget.** `scripts/lint/raw-invoke-grandfather.json` maps each file to the number of pre-existing raw invokes it may keep (generated AST-accurately from an ESLint run). The rule grandfathers the first N occurrences per file; **any invoke above N, or any invoke in an unbudgeted file, is an error.** (File-level allow-listing was rejected — it would let a new invoke hide in an already-listed file.)
2. **Shrink-only, mechanically.** `scripts/ci/check-raw-invoke-budget-shrinks.mjs` (blocking, `gate-verify`) diffs the budget against `main` and fails if any count grows or a new entry appears. So the two escape routes are both closed: adding a raw invoke → ESLint error; raising the budget to permit it → this guard errors. For **every** developer, in the required gate.
3. **Start the burn-down.** The Phase-0c codemod migrated the 7 mechanically-safe sites to `invokeEdge`; the budget was re-derived downward (88 → 80). The remaining ~52 (incl. ~5 frozen-auth sites for the Phase 2-AUTH track) migrate over Phase 1, each lowering the budget, never raising it. At zero, the rule needs no budget and error-shape coupling is impossible by construction.

## Considered options

- **(chosen) Flip to `error` + count-based shrink-only budget + migrate the safe batch.** Delivers the structural guarantee for all new code immediately; the ratchet burns the rest down without a flag day.
- **File-level allow-list (like the guard-test allowlist).** Rejected — a new invoke added to an already-listed file would pass; not structural.
- **Inline `eslint-disable` on each site.** Rejected — ~80 comments across ~48 files, noisier and no shrink-only enforcement (a new disable is just another comment).
- **Wait until all sites are migrated, then flip.** Rejected — leaves new couplings possible for the whole migration window; the budget lets us get the guarantee now.

## Consequences

- **Positive:** new raw invokes are impossible for any developer (both the call and the budget-raise are blocked in the required gate); the structural completion of ADR-0028 is real, not aspirational; the burn-down is measurable (the budget total is the remaining work) and monotonic.
- **Negative / trade-offs:**
  - The budget file must be regenerated _downward_ as sites migrate — run ESLint over `src` **with the budget emptied** to get true counts; regenerating against a populated budget yields zero, since the rule suppresses within-budget sites.
  - **Retry on migrated calls.** `invokeEdge` retries once on `FunctionsFetchError` / network `TypeError` — the fetch rejected without a received response, which is **at-least-once ambiguous** (the request may have been delivered and its response lost), _not_ "never reached the server." So non-idempotent migrated calls must set `noRetry` (applied to `dsar-submit` and `notify-applicant-status`; `notify-applicant`'s deliverability sibling is safe via a stable `idempotencyKey`; the read/sync migrations are idempotent). Any future migration of a state-changing call must do the same.
  - **Enforcement scope (honest).** The lint rule catches the member-access form _and_ the direct destructure bypasses (`const { invoke } = supabase.functions`, `const { functions } = supabase`) and aliasing (the `supabase.functions.invoke` access is flagged at the assignment). Purely dynamic access (`supabase["functions"]["invoke"]`) is beyond a lint rule — pathological, not a realistic form. The by-construction guarantee is the end state (budget = 0 → no raw error object exists to couple to); the rule is the practical enforcer covering the realistic forms.
  - **Wrapper trust boundary.** `ALLOWED_FILES` in the rule (the 3 sanctioned wrappers: `invokeEdge`, `audited-invoke`, `freescoutInvoke`) is exempt and _not_ covered by the shrink guard — adding an entry grants unlimited raw invokes. It is a small, reviewed trust boundary, visible in the plugin diff; a new wrapper is a deliberate, reviewed change.
  - Frozen-auth sites keep their budget until Phase 2-AUTH.

## Confirmation

`npx eslint src` reports **0** `no-raw-functions-invoke` violations with the budget in place; `src/test/smoke/check-raw-invoke-budget-shrinks.smoke.test.ts` proves the shrink-only guard (raise → fail, new key → fail, shrink/hold → pass, fail-closed) and it discriminates under the mutation gate. `tsc --noEmit` is clean after the 7 migrations. The budget total (80) is the Phase-1 burn-down counter; this ADR is complete when it reaches 0.

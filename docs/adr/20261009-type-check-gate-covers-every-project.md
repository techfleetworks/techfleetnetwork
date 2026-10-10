# ADR 20261009 — The CI type-check gate checks every project (kill the vacuous `tsc` no-op)

- Status: Accepted
- Date: 2026-10-09
- Deciders: Morgan Denner
- Epic: CI/CD gate integrity

> Numbering: the 4-digit ADR space is frozen — parallel branches kept colliding on it (this change
> itself was bumped 0067→0068 and then collided again when `0068-dependency-advisories-delta-gate`
> merged first). Per the now-merged date-ID convention, new ADRs use a `YYYYMMDD-slug` filename, so
> this is `20261009-type-check-gate-covers-every-project`.

## Context

CI's **Type-check** step ran `npx tsc --noEmit` and had **never gone red** — not because the
tree was type-clean, but because that command type-checks **zero files**.

The root `tsconfig.json` is a _solution_ file:

```jsonc
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
}
```

A bare `tsc --noEmit` does **not** follow project references (only `tsc -b` does), so with
`files: []` it compiles nothing and always exits 0. The step was a green no-op for ~the whole life
of the repo. Meanwhile the real build is `vite build`, which strips types with esbuild and **never
type-checks** — so nothing, anywhere, was checking the app's types. Real type errors shipped on a
green `main`.

From a clean checkout, the true picture:

```
npx tsc --noEmit                      → exit 0   (0 files checked — the no-op)
npx tsc --noEmit -p tsconfig.app.json → exit 2   (real errors)
```

The hidden backlog the real check surfaced:

- **App project** — ~50 errors: a stale generated `src/integrations/supabase/types.ts` (missing
  the `handoff_*` tables the DB and migrations already have), `invokeEdge(...)` results read as
  `unknown`, design-system components called with props they no longer accept (the in-flight
  TFDS migration), `.update(payload)` passed loosely-typed objects, a recharts v3 typing drift in
  the vendored chart primitive, and a React-Query v5 `mutationFn` arity change.
- **Test project** — test files that were _never_ type-checked, including fixtures whose mocks no
  longer match the real `Session` / `AuthError` / PostgREST types, and contract tests that rely on
  discriminated-union narrowing that the project's non-strict config silently disables (below).
- **Node/support files** — `src/test/setup.ts` (`global`), `src/test/smoke/support/guard-fixture.ts`
  and a docs test (`node:fs`/`node:path`/`node:os`, `process`) had no Node types in scope.

This is a textbook `decisions.md §6` violation: _a gate must assert the thing that matters and fail
closed, never pass falsely._ The type-check asserted nothing.

### Why not `tsc -b`?

`tsc -b` (build mode) _does_ follow references, but it is **incremental and stateful**: it records
results in `.tsbuildinfo` and on a warm run reports "up to date" and exits 0 **without
re-reporting errors**. On this OneDrive-backed box two back-to-back `tsc -b` runs gave exit 0 (empty
output) then exit 2 (full error list) on an unchanged tree. A gate must be deterministic and fail
closed, so the gate never uses build mode.

### The non-strict narrowing trap

Several contract tests narrow a discriminated union — `if (!result.ok) expect(result.error.code)…`
(`AuthResult`), `if (verdict.allowed) return; verdict.malicious` (the input firewall). TypeScript
**only narrows discriminated unions when `strictNullChecks` is on**, and the app config sets
`strict: false`. Minimal proof:

```ts
type R = { ok: true; value: number } | { ok: false; error: { code: string } };
declare const r: R;
if (!r.ok) r.error.code; // strictNullChecks:false → TS2339  |  strictNullChecks:true → OK
```

So these tests were correct TypeScript that the project's own config made un-checkable — another
reason the step had to be a no-op to stay green.

## Decision

**1 — The gate checks every real project, statelessly, and fails closed.**
A small runner, `scripts/ci/typecheck.mjs`, runs `tsc --noEmit -p <project>` for each of
`tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.test.json`; prints a per-project evidence
line (files checked); and exits non-zero on any type error, any tsc that cannot start, **or any
project that resolves zero input files** (the vacuity we are killing, caught via `--listFilesOnly`).
It is wired as `npm run typecheck` and replaces `npx tsc --noEmit` in the CI **Type-check** step.

**2 — A dedicated test/support project with Node types.**
New `tsconfig.test.json` owns every `*.test.ts(x)` / `*.spec.ts(x)` and `src/test/**`, with
`types: ["node", "vitest/globals", "@testing-library/jest-dom"]`. The app project
(`tsconfig.app.json`) now **excludes** all test files, staying browser-pure — a test-only Node
global can never leak into shipped UI code. `tsconfig.node.json` also type-checks `vitest.config.ts`.
It stays non-strict like the app (see the narrowing fix below); flipping strict is the tracked
app-wide follow-up, not a gate-PR change.

**3 — Regenerate the drifted generated types.**
`src/integrations/supabase/types.ts` gains the `handoff_*` tables and the `handoff_completeness`
RPC that the DB/migrations already define. (These entries are hand-authored to match the
migrations because this environment has no DB credentials for `supabase gen types`; wiring that
generation into CI is the tracked follow-up below.)

**4 — Fix the surfaced errors behavior-preservingly.**
The app builds with esbuild (types stripped), so every surfaced error is in code that already runs;
fixes match current runtime. Design-system components that _drop_ a prop at runtime (e.g. `CardTitle`
ignores `className`) have that inert prop removed from call sites (the now-real gate catches any
re-introduction); `maxLength`, which was silently not enforced, is routed correctly through
`inputProps` (never weaken validation); `invokeEdge` calls get response types; recharts content
props use recharts' own payload types; the React-Query `mutationFn` forwards its new `context` arg.
In the test files, the discriminated-union narrowing that `strict: false` disables is replaced with
an explicit cast to the error/blocked branch (the test has already asserted which branch it is), so
the test project stays non-strict and consistent with the app; drifted fixture mocks (`Session`,
`AuthError`, PostgREST responses) are typed to the real shapes.

**5 — Make the no-op structurally impossible to return.**
`src/test/smoke/typecheck-gate.smoke.test.ts` (runs in the required `gate-test` job) asserts the
root is a references-only solution file, that the runner checks all three projects with
`--noEmit -p` (and never `tsc -b`), that `package.json` `typecheck` and the CI step both go through
the runner (never a bare `tsc`), and that each project still resolves a non-trivial set of input
files. Any regression — re-pointing CI at `tsc --noEmit`, emptying an `include`, dropping a project
— reddens it.

## Alternatives considered

- **`tsc -b` in CI.** Rejected: incremental/stateful, can report "up to date" and skip errors; it
  produced non-deterministic red/green on this filesystem. The gate must fail closed deterministically.
- **Add Node types to the app project and keep one project.** Rejected: it lets `process`/`Buffer`
  and other Node globals typecheck inside shipped browser code, defeating the purpose of catching
  environment confusion. A separate test project keeps the app browser-pure.
- **Flip the whole app to `strict`/`strictNullChecks` now.** Rejected for this PR: the app is large
  and written non-strict; turning it on app-wide surfaces a big, unrelated backlog. A staged
  app-wide `strict` migration is the right forward standard and is the tracked follow-up.
- **Enable `strictNullChecks` on the test project only** (to make narrowing work there). Rejected,
  measured: the test project type-checks the app modules its tests import, so strict-null checking
  leaks into ~30 app sites (auth-adjacent telemetry in `login-telemetry.ts` / `security-events.ts`,
  `invokeEdge.ts`, several System-Health tabs) — real latent null issues, but touching frozen/
  auth-adjacent code is far outside a gate-wiring change. The narrowing is instead fixed with a
  local cast per test assertion.
- **A shrink-only "type-error budget" grandfathering the backlog** (the raw-invoke / dropped-error
  pattern). Rejected: the backlog here is bounded and fixable now, and a green tree with a blocking
  gate is a stronger guarantee than a budget that merely can't grow. Budgets are for backlogs too
  large to clear in one change; this one is not.

## Consequences

**Positive**

- The type-check is real: `app`, `node`, and `test` are all checked, and the step goes red on a
  genuine type error (proven by injecting one — see the PR).
- The whole hidden backlog is fixed; `main` is actually type-clean, not green-by-vacuity.
- The no-op cannot silently return: the committed smoke test fails closed on any wiring regression,
  complementing the runner's own zero-file guard.
- The test suite is now type-checked against the real app and library types, so drifted mocks and
  dead `@ts-expect-error`s are caught instead of rotting silently.

**Negative / accepted**

- The `handoff_*` / `handoff_completeness` entries in `types.ts` are hand-authored (no DB creds here
  to run `supabase gen types`), but they were **verified against the live prod schema** by
  introspecting `pg_attribute` / `pg_proc` (column names, exact types, nullability, the RPC
  signature) and correcting the drift the check found — two columns on
  `handoff_deliverable_submissions` (`extracted_text`, `extracted_at`) and five on
  `handoff_productions` (`worker_id`, `lease_expires_at`, `heartbeat_at`, `attempts`,
  `pipeline_state`) that later migrations added after the ones first transcribed, plus `gap_count`'s
  non-null flag. `phase` is intentionally typed `string` rather than the `project_phase` enum, to
  match how the untouched `handoff.service.ts` already passes it. The remaining **follow-up** is to
  wire `supabase gen types` + a generated-vs-schema drift check into CI so the file can never drift
  again without a red build.
- The test project checks app code it imports under `strictNullChecks` while the app project does
  not — a deliberate, bounded inconsistency until the app-wide `strict` migration (tracked
  follow-up) lands.
- CI type-check now does real work (three `tsc` passes) instead of nothing — a few minutes of CI
  time, which is the point.
- **Deploy:** CI/tooling + types + source type-only fixes. No schema or runtime behavior change
  (esbuild already stripped these types); the frontend ships via Cloudflare Pages as usual.

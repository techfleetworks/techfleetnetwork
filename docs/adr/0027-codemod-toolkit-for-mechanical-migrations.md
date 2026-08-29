# ADR 0027 — A ts-morph codemod toolkit for the Category-② mechanical migrations

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: the hardening plan's **Phase 0c** (and Phases 1/3/4 which consume it); ADR-0026 (expand/contract, for the DB half of the mechanical work); `scripts/codemod/`; `decisions.md §6` (fail-closed) and `AGENTS.md` (discriminating tests); the `enterprise-architecture-standards`, `comprehensive-test-strategy`, and `arch-encode` skills.

## Context

The audit's ~500 Category-② findings are the same handful of edits repeated across hundreds of sites: UI→service data access (135), raw `supabase.functions.invoke` → `invokeEdge` (≈43–60), edge-auth convergence (~96+31), inline-CORS → shared helpers (~90). Hand-migrating these is slow, inconsistent, and error-prone, and each hand edit is a fresh chance to break something. Phase 0c calls for a **codemod toolkit** so each transform is authored and reviewed **once**, then applied consistently, with the gate + tests verifying the result — built _before_ Phases 1/3/4 depend on it.

Two risks make a naive "just write a script" approach dangerous here:

1. A codemod that rewrites code it doesn't fully understand can silently produce **subtly-wrong** output (dropped options, changed error semantics) across hundreds of files at once.
2. The **frozen auth layer** (`src/features/auth/**`, Phase 2-AUTH) must never be touched by a mechanical sweep — a single bad auth edit is the highest-blast-radius change in the repo.

## Decision

Build a small, reusable **ts-morph** toolkit under `scripts/codemod/`:

1. **Harness / codemod split.** `run-codemod.mjs` owns file selection, exclusions, modes, and reporting; a codemod under `codemods/<name>.mjs` owns only the per-file AST transform (`apply(sourceFile) → { changed, manual:[{line,reason}] }`). Codemods never choose files or write to disk.
2. **Three modes.** dry-run (default; report, write nothing), `--write` (apply; **idempotent** — second run is a no-op), `--check` (write nothing; exit 1 if anything would change — a CI idempotency check).
3. **Transform the provably-safe shape, REPORT the rest.** A codemod transforms only sites it can prove are equivalent and emits every other site as `MANUAL-REVIEW file:line reason`. Coverage is deliberately partial; the manual list is the human worklist. (The first codemod, `raw-invoke-to-invoke-edge`, transforms exactly `const { data, error } = await …invoke(); if (error) throw error;` → `invokeEdge`, and only when the options are `{ body, headers }`-only and `error` is used nowhere else — because `invokeEdge` throws and drops `method`/`region`.)
4. **Central, unremovable exclusions.** The harness (not the codemod) hard-excludes tests and, critically, `src/features/auth/**`; a codemod's own `exclude` can only _add_. This is proven by a **discriminating** harness test (removing the auth entry makes an auth path stop being excluded → the test fails).
5. **Fail closed** (exit 2) on unknown codemod, missing tsconfig, a zero-file scan (glob/tsconfig drift), or any per-file transform error (no partial write) — per `decisions.md §6`.
6. **Config-independent transforms + one shared project config.** Transforms use only syntactic AST inspection, never the language service, so they behave identically in the harness and in tests; and the harness and the unit tests import a single `PROJECT_OPTIONS` so the test environment can never drift from the harness environment.

## Considered options

- **(chosen) ts-morph harness + safe-transform-or-report codemods.** ts-morph gives typed AST manipulation with far less ceremony than raw TypeScript compiler API or jscodeshift's generic API; the harness centralizes the dangerous parts (file selection, the frozen-auth exclusion, fail-closed) so each codemod stays small and reviewable.
- **jscodeshift.** Rejected — its recast/babel core is JS-first; ts-morph handles TS/TSX types (needed for `invoke<T>` type args) more naturally, and the project already depends on TypeScript.
- **Hand-migrate the ~500 sites.** Rejected — slow, inconsistent, unreviewable in bulk, and no guardrail against touching frozen auth.
- **A high-coverage codemod that rewrites bespoke error handling.** Rejected — rewriting varied `{error}`/`handleServiceError`/custom branches risks silent wrong output at scale. Precision + a manual worklist is safer than broad guessing.

## Consequences

- **Positive:** Phases 1/3/4 get a proven, consistent transform tool; the frozen-auth layer is mechanically protected (and that protection is itself tested); partial coverage is explicit (a worklist, not a silent gap); the harness is reusable for the next codemod (add a `codemods/<name>.mjs`, get modes/exclusions/fail-closed for free).
- **Negative / trade-offs:** ts-morph is a new devDependency; codemods must be authored conservatively (a whole class of sites lands in MANUAL rather than auto-migrated), so a human still does the judgment-heavy migrations. `--check` is an idempotency check, not a "no raw invokes remain" gate — that end-state is enforced separately by the `no-raw-functions-invoke` lint rule (flipped to error in Phase 1).

## Confirmation

`src/test/codemod/*.test.ts` prove the transform (exact rewrite, idempotency, each MANUAL shape untouched, options/`error`-reuse guards) and the harness exclusions (frozen-auth, discriminating). A dry-run over the repo reports `7 changed / 53 manual / 0 errors` with no `src/features/auth/**` file touched and nothing written. The toolkit is the tool; the actual site migrations run in Phase 1.

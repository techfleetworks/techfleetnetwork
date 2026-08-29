# Codemod toolkit (Phase 0c)

A reusable [`ts-morph`](https://ts-morph.com) harness for the **Category-②** mechanical
migrations in the hardening plan (`docs/architecture/audit-2026-08/hardening-plan.md`
§"Phase 0 · 0c"): build a transform once, review it once, then apply it consistently across
hundreds of sites with the arch-gate + tests verifying the result. It arms Phase 1's
raw-invoke migration and is reused for the big Phase 3/4 migrations.

## Layout

```
scripts/codemod/
  run-codemod.mjs          # the harness/runner (owns file selection, exclusions, modes, reporting)
  codemods/
    raw-invoke-to-invoke-edge.mjs   # first codemod
  README.md
src/test/codemod/          # vitest unit tests, one per codemod
```

## Running

```bash
# dry-run (default): report what WOULD change, write nothing, exit 0
npm run codemod raw-invoke-to-invoke-edge

# apply to disk (idempotent — running twice makes 0 changes the second time)
npm run codemod raw-invoke-to-invoke-edge -- --write

# CI idempotency check: exit 1 if anything WOULD still change, else 0
npm run codemod:check

# restrict to specific files/globs (optional trailing args)
npm run codemod raw-invoke-to-invoke-edge -- src/services/**/*.ts
```

Raw form: `node scripts/codemod/run-codemod.mjs <name> [--write] [--check] [globs...]`.

## The harness contract

A codemod is a module at `scripts/codemod/codemods/<name>.mjs` that exports:

```js
export const name = "<name>";                 // must equal the file name
export const exclude = ["glob", ...];         // OPTIONAL extra per-codemod exclusions
export function apply(sourceFile) {
  // mutate `sourceFile` in place (ts-morph SourceFile); never write to disk here
  return { changed: /* boolean */, manual: [{ line, reason }, ...] };
}
```

The **harness** owns everything else:

- **Modes.**
  - _default_ = **dry-run** — reports, writes nothing, exits 0.
  - `--write` — saves changes to disk. Must be **idempotent** (2nd run → 0 changes).
  - `--check` — writes nothing; exits **1** if anything would change, else 0. This is a
    post-migration idempotency gate for CI — **not** the "no raw invokes remain" check
    (that is a separate lint rule's job).
- **File selection** — the repo `tsconfig.json` compiler options + source files added by
  glob (default `src/**/*.ts`, `src/**/*.tsx`; override with trailing args).
- **Fail-closed** — unknown codemod, missing `tsconfig.json`, or a codemod throwing on any
  file → exit **2** with a clear message. A per-file transform error is caught, reported as
  `ERROR <file>: <msg>`, and **fails the whole run** — never silently skipped, never a
  partial write.
- **Reporting** — one line per file (`CHANGED` / `MANUAL-REVIEW <file>:<line> <reason>` /
  `ERROR`) plus a totals line, e.g.
  `raw-invoke-to-invoke-edge: 12 changed, 43 need manual review, 0 errors (…) [dry-run]`.
- Exit codes: `0` ok · `1` `--check` found pending changes · `2` fail-closed.

## Exclusions (central, non-negotiable)

The harness hard-codes these and applies them to **every** codemod:

- `**/*.test.*`, `**/*.spec.*`, `src/test/**` — never migrate tests.
- **`src/features/auth/**` — the FROZEN auth layer.** It belongs to Phase 2-AUTH and the
  toolkit must **never** touch it. This is enforced here so no individual codemod can opt
  back in. Codemods may add their own `exclude` globs on top, but cannot remove these.

## The guiding principle: transform the safe pattern, report the rest

Prefer **precision over coverage**. A codemod should transform only the one canonical shape
it can prove is semantically equivalent, and emit a `MANUAL-REVIEW` line (with a one-word
reason) for every other shape rather than guessing. It is expected — and fine — for most
sites to land in `MANUAL-REVIEW`; a human then handles those. A codemod that guesses at
bespoke error handling is worse than one that reports honestly.

### Example: `raw-invoke-to-invoke-edge`

`invokeEdge` (`src/lib/edge/invokeEdge.ts`) **throws** `EdgeInvokeError` on failure, whereas
`supabase.functions.invoke` **returns** `{ data, error }`. They are only equivalent when the
caller already converts a truthy `error` into a throw and does nothing else. So the codemod
transforms exactly:

```ts
const { data, error } = await supabase.functions.invoke<T>(FN, OPTS);
if (error) throw error;
// →
const data = await invokeEdge<T>(FN, OPTS);
// (+ import { invokeEdge } from "@/lib/edge/invokeEdge"; if absent)
```

Everything else (`{ error }`-only + `handleServiceError`, bare `await …invoke()`, error
returned not thrown, result wrapped in another call, …) is reported as manual with a reason
like `error-only`, `no-destructure`, or `error-not-thrown`. It also self-skips `invokeEdge.ts`
and `src/integrations/supabase/audited-invoke.ts`, which legitimately call the raw client.

## Adding a codemod

1. Create `scripts/codemod/codemods/<name>.mjs` exporting `name` + `apply` (above). Follow
   `raw-invoke-to-invoke-edge.mjs` for structure: classify every target site, transform only
   the safe canonical shape, return the rest as `manual`.
2. Add unit tests at `src/test/codemod/<name>.test.ts` — build in-memory `SourceFile`s from
   strings, run `apply`, assert exact transformed text + idempotency + that manual sites are
   left untouched.
3. Dry-run over the real repo, sanity-check the CHANGED vs MANUAL-REVIEW totals, then land it.
   Wire a `--check` idempotency gate into CI once the migration is applied.

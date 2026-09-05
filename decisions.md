# Architecture decisions — TechFleet Network

Standing rules for how this codebase is structured. `judge-arch` reviews every change against this
file; `arch-gate.config.json` (run by `scripts/ci/arch-gate.mjs`, wired as `check:architecture`)
enforces the checkable subset. Grow it one caught mistake at a time with `arch-encode`; keep it
lean — it loads every session.

**The intended shape:** `UI (src/pages, src/components) → data hooks (src/hooks, React Query) →
services (src/services/*.service.ts) → lib / integrations (src/lib, src/integrations)`. Data flows
down through owners; the UI never reaches past hooks/services to Supabase.

---

## The standing lens — four questions for every change

1. Boundary placement — is business logic out of components and route handlers?
2. Data ownership — does each fact have one writer?
3. Dependency direction — is domain code free of React/DOM/web concerns?
4. Error handling — does every failure recover, retry, or **report** (to operators, not just the user)?

## 1 · UI never touches Supabase directly

```
❌ never — inside src/components/** or src/pages/**
const { data } = await supabase.from('projects').select()
✅ always — go through the hook that owns this data
const projects = useProjects()      // useProjects → projectService
```

Writes to `profiles` go through **`ProfileService`** (it centralizes `deepSanitize` + the
mass-assignment allow-list). A raw `supabase.from('profiles').update(...)` in the UI is a security
regression (A03/A04), not just a layering smell.

## 2 · One fact, one owner

The **Gumroad membership** model is the template: the webhook writes only the `gumroad_sales`
ledger and one trigger (`compute_membership()`) derives every `membership_*` field — one writer,
one truth. Apply the same everywhere:

```
❌ never — a mirror kept in sync by hand, or two writers for one field
profiles.freescout_customer_id  // written by 3 functions on 2 different keys
✅ always — one idempotent writer keyed on an immutable id; display copies are labeled caches
```

Mirrors of Discord / Freescout / Airtable / Gumroad get a single sync path; `discord_user_id`
(immutable) is the identity key, not `discord_username` (a display cache).

## 3 · Domain code is web-free; one Supabase client

```
❌ never — a service importing React or touching the DOM
// src/services/*.service.ts
import { useMemo } from 'react'
window.localStorage.getItem(...)
✅ always — plain data in, plain data out; storage injected via src/lib/*
```

Exactly one client, at `src/integrations/supabase/client.ts`. Never a second `createClient`.
(The frozen auth area — `src/lib/auth/**`, `src/features/auth/**`, `main.tsx` boot, the client —
follows `06-auth-flow-lockdown`; do not touch without the auth regression suite.)

## 4 · Every failure reports

```
❌ never — visible to the user, invisible to operators
try { await supabase.functions.invoke('promote-teacher') } catch { toast.error('failed') }
✅ always — route privileged calls through the audited wrapper
try { await auditedInvoke('promote-teacher') } catch (e) { report(e); toast.error('failed') }
```

`invokeEdge`/`auditedInvoke` report + retry; a bare `console.error` is not reporting (the logger
only writes to the browser console). Prefer flipping `no-raw-functions-invoke` to `error`.

The reporter is symmetric: an error the structural classifier _drops_ (`classify().report === false`)
is **still tracked** — in aggregate, never a silent `return` (ADR-0031).

```
❌ never — a classifier drop that vanishes: a persistently-broken backend seen as "transient"
           (every 500/timeout is) leaves ZERO durable signal, so the outage is invisible
if (!classify(err).report) return;
✅ always — record the drop into the per-minute aggregate; a spike surfaces in System Health
if (!classify(err).report) { recordClassifiedDrop(reason, source); return; }
```

Enforced by `scripts/ci/check-report-has-no-silent-drop.mjs` (AST: report()'s `!classified.report`
branch must call `recordClassifiedDrop` before it returns; fails closed if that branch is gone).
Per ADR-0021 this stays **aggregate** (one `client_error_suppressed` row per reason/source per
minute, tagged `classified:<reason>`), never a per-occurrence audit row.

And a supabase read must never **drop** its `error` — take `{ data, error }`, not `{ data }` (ADR-0032):

```
❌ never — a failed query is invisible: data is null and nothing knows why (blank data / infinite skeleton)
const { data } = await supabase.from('projects').select()
✅ always — take error and handle it (throw / report / branch)
const { data, error } = await supabase.from('projects').select()
if (error) throw error
```

Enforced by the `no-dropped-supabase-error` ESLint rule (`error`) + a shrink-only per-file budget
(`scripts/lint/dropped-supabase-error-grandfather.json`) + `scripts/ci/check-dropped-supabase-error-budget-shrinks.mjs`,
across `src/services`/`src/hooks`/edge (UI reads move into hooks in Phase 3). A new **directly-awaited**
supabase read that drops `error` fails ESLint; raising the budget errors in the shrink guard — both
blocked. The grandfathered sites burn to zero. (Conservative gaps, by design, not caught: a drop behind
a retry wrapper — `await withAuthLockRetry(() => supabase…)` — a non-standard client name, an
intermediate variable, or `(await …).data`. Fail-safe — they burn down with review, they never false-pass.)

And the `suppressForward` logger opt-out may be used **only** where the error is also reported (ADR-0033):

```
❌ never — silences the reporter bridge with nothing else reporting → silent drop once ramped
log.error("save", msg, {}, err, { suppressForward: true });   // and no report/reportError in this fn
✅ always — suppressForward pairs with a real report of the same error
log.error("save", msg, {}, err, { suppressForward: true });
reportError(err, "svc.save");   // (or handleServiceError, which reports itself)
```

Enforced by `scripts/ci/check-suppressforward-has-report.mjs` (AST: every `suppressForward: true`
must have a `report`/`reportError`/`reportValidationRejection`/`handleServiceError` in its enclosing
function; fails closed).

## 5 · Edge functions compose `_shared`

```
❌ never — hand-rolled per function (auth, client, CORS all drift)
const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*' }
✅ always — import the shared helpers
import { getAdminClient }        from '../_shared/admin-client.ts'
import { requireAdminRequest }   from '../_shared/request-auth.ts'   // has_role RPC, one admin predicate
import { handleCors, jsonResponse } from '../_shared/http.ts'        // includes the x-trace-id preflight headers
```

The entrypoint composes the audit wrapper too — the ONE place an uncaught throw becomes an
`edge_function_error` audit row (§4) and an `x-trace-id` is guaranteed on the request/response:

```
❌ never — a bare handler: crashes vanish from audit_log, logs can't be traced
Deno.serve(async (req) => { ... })
✅ always — wrap the top-level handler (the label MUST equal the function's directory name)
import { withAuditWrapper } from '../_shared/audit.ts'
Deno.serve(withAuditWrapper('promote-to-teacher', async (req) => { ... }))
```

Enforced by `scripts/ci/check-edge-audit-wrapper-coverage.mjs` — a ratchet: every serving
`supabase/functions/*/index.ts` must wrap the entrypoint **directly** (the wrapper is the handler
passed to `Deno.serve`/`serve` — wrapping an inner sub-handler while serving a raw one is rejected,
not silently passed), the label must match the directory name, and the burn-down `ALLOWLIST` may
only shrink.

## 6 · Gate integrity — a check must fail closed, never pass falsely

The checks that guard this architecture must themselves never report a false green.

```
❌ never — a swallowed error or missing input becomes a silent pass
try { walk(ROOT) } catch { console.error(e); process.exit(0) }        // green forever if ROOT moves
✅ always — fail closed + prove what you inspected
try { files = walk(ROOT) } catch (e) { console.error(e); process.exit(2) }
if (files.length === 0) { console.error('scanned 0 files — path moved?'); process.exit(2) }
console.log(`OK — ${files.length} files scanned`)                     // evidence: what + how much
```

Every CI guard (`scripts/ci/*`) must (a) **emit a substantial evidence line** on success (what it
inspected + a count/paths), (b) **fail closed** — a missing input, internal error, or zero-scan
exits non-zero, never a silent `exit 0`, (c) never pass vacuously on a diff-based no-op.

And every guard must be **pinned by a committed test** — a guard proven only by an ephemeral
fixture (or never proven) can rot to a false green when its own logic regresses, and nothing
catches it.

```
❌ never — ship a guard whose only proof was a throwaway fixture you deleted
scripts/ci/check-foo.mjs        // no test references it; a broken regex ships green
✅ always — a committed test runs the guard against fixtures and asserts its exit codes
src/test/smoke/check-foo.smoke.test.ts   // clean → 0, violation → 1, missing input → 2
```

Enforced by `scripts/ci/check-guard-has-test.mjs` — a ratchet: every `scripts/ci/check-*.mjs`
(and `arch-gate.mjs`) must be referenced by a committed `*.test.ts`; guards predating the rule sit
on a burn-down `ALLOWLIST` that may **only shrink**.

And that test must **discriminate** — it must FAIL when the guard is a no-op. A test that execs
the guard but only asserts the happy path proves nothing; a _broken_ guard would still pass it.

```
❌ never — a vacuous guard test (passes even if the guard detects nothing)
it("runs", () => { runGuard(fixture); expect(true).toBe(true); })   // no assertion tied to detection
✅ always — assert a real violation is FLAGGED, so it reddens when detection breaks
it("flags X", () => expect(runGuard(violatingFixture)).toBe(1))     // fails if the guard stops detecting
```

Enforced by `scripts/ci/verify-guard-test-discrimination.mjs` — it no-ops every tested guard, runs
the smoke suite, and fails if any guard's test still passes. Prove it by hand: break a guard's regex
and its committed test must go red. See ADR-0022, ADR-0023; the transferable playbook is `AGENTS.md`.
`check-owasp-coverage` / `check-triage-actionable-parity` are the models. The meta-guard
`check-ci-guard-integrity.mjs` (wired into the required gate) enforces the worst case — no
`exit(0)` inside a `catch`; a deliberate fail-open opts out with a `// ci-guard-integrity-ok: <reason>`
marker. Broader fleet hardening (evidence counts + zero-scan asserts on the remaining guards) is
tracked in `docs/architecture/audit-2026-08/review-followups.md`. And a guard must actually **run**:
`check-guards-wired.mjs` fails if any `check-*.mjs` is referenced by no workflow — an unwired guard
verifies nothing (ADR-0024, mechanized in **ADR-0029**); deliberate deferrals go on a shrink-only allowlist.

**Verify reality, not a ledger.** A gate must assert the thing that matters, not a claim that stands in
for it. The migration-applied gate (ADR-0020) queried prod's `schema_migrations` ledger — a table that
does **not** exist in our post-Lovable prod — so the query errored, the error read as "unreachable → skip
green," and the gate could never go red. It checked a claim (a missing one) instead of the schema itself,
and a migration (`feature_flags`) shipped unapplied undetected until it broke live traffic.

```
❌ never — verify a proxy/ledger that can be missing, stale, or forged (and skip-green when it's absent)
const applied = await q(`select version from supabase_migrations.schema_migrations`) // relation absent → warn → exit 0
✅ always — verify the reality the migration must produce, and fail closed when you can't check
const present = await q(`select tablename from pg_tables where schemaname='public'`)  // the object is there, or it isn't
if (!token) { console.error('cannot verify prod — no token'); process.exit(2) }        // can't check ⇒ red, never green
```

Enforced by `scripts/ci/check-db-objects-present.mjs` (**ADR-0034**, superseding ADR-0020): every table/
function the committed migrations declare must EXIST in prod (queried over HTTPS via the Management API) or
the gate is red; no token / unreachable / unexpected response fails **closed**.

**No UTF-8 BOM in tracked text.** A BOM (bytes `EF BB BF`) at the start of a file is invisible in most
editors but makes `JSON.parse` throw — so a budget/allowlist file that silently gains one crashes the guard
that reads it (a self-inflicted false-red; on Windows an easy one — PowerShell's `Set-Content -Encoding
utf8` and `>` both prepend a BOM).

```
❌ never — write a repo JSON/text file in a way that can prepend a BOM
"…" | Set-Content -Encoding utf8 budget.json      # PowerShell adds EF BB BF → JSON.parse throws downstream
✅ always — write UTF-8 without a BOM (allowlist-reading guards also use the shared tolerant reader)
[System.IO.File]::WriteAllText($path, $text)       # no BOM; or an editor set to "UTF-8 (no BOM)"
import { readJson } from './_json.mjs'   // scripts/ci/_json.mjs: JSON.parse that strips a leading BOM
```

Enforced by `scripts/ci/check-no-bom.mjs` (blocking, in the gate job): any tracked text file beginning with
a BOM fails CI, so the class cannot enter the repo (**ADR-0034**).

---

## 7 · Schema changes are expand/contract

Migrations are hand-applied (`supabase db push`) and forward-only, and one can be live on prod **while
the old code still runs** (a `db push` is not atomic with a deploy). So a migration must be safe to apply
before the code that needs it ships, and safe to leave applied if that code rolls back.

```sql
-- ❌ never — breaks still-running old code the instant it applies
ALTER TABLE profiles RENAME COLUMN full_name TO display_name;
ALTER TABLE orders  ADD COLUMN owner_id uuid NOT NULL;
-- ✅ always — EXPAND now (additive + backfill), CONTRACT in a later migration once no code uses the old shape
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;   -- expand + backfill + dual-write in code
-- … later, separate migration: ALTER TABLE profiles DROP COLUMN IF EXISTS full_name;  -- contract
```

Rename/drop/type-change/`NOT NULL`/function-signature changes are all **contract** — never in-place, never
in the expand migration. Single-writer ownership moves (Phase 3) use expand→contract so readers never see a
half-applied state. Full rules + examples: `supabase/migrations/CLAUDE.md`. Rationale: **ADR-0026**
(builds on ADR-0034's db-objects-present gate that supersedes ADR-0020, ADR-0024's prove-at-the-owning-layer/pgTAP).

---

## 8 · The raw edge-error shape has one owner

`invokeEdge` normalizes edge failures into a typed `EdgeInvokeError`. Only the error
normalization/classification layer may touch the raw supabase error shape; every other consumer uses
the normalized form.

```ts
// ❌ never (outside src/lib/errors, transient-*, error-reporter, invokeEdge)
const status = (error as { context?: { status?: number } }).context?.status;
if (err instanceof FunctionsHttpError) {
  /* … */
}
// ✅ always — route through invokeEdge and read the typed field
const data = await invokeEdge<T>("fn", { body }); // throws EdgeInvokeError
// in catch: const status = err instanceof EdgeInvokeError ? err.status : undefined;
```

Enforced by `scripts/ci/check-no-raw-functions-error-shape.mjs` (blocking) — defense-in-depth that
blocks the **common, direct** couplings (`.context.status`, `["context"]`, `instanceof`/`.name ===`
`Functions*Error`). It is a regex guard, so it is **not** complete: intermediate-variable / aliased /
destructured access slips past it. The **by-construction** guarantee comes from Phase 1's no-raw-invoke
ban — once `no-raw-functions-invoke` is `error` and every call goes through `invokeEdge`, consumers never
receive a raw error to couple to. Residual coupled consumers at un-migrated raw-invoke sites are tracked
for Phase 1. Rationale: **ADR-0028**.

---

## Decision log (ADRs)

Bigger or reversible decisions (which email pipeline is canonical, who owns `freescout_customer_id`,
Discord role-state ownership, the network-stats RPC) go in `docs/adr/` — use the
`architectural-decision-records` skill. This file holds the standing rules; the ADRs hold the dated why.

_The `judge-arch` / `arch-encode` skills live in `.claude/skills/`, sourced from
[techfleetworks/enterprise-software-AI-skills](https://github.com/techfleetworks/enterprise-software-AI-skills)._

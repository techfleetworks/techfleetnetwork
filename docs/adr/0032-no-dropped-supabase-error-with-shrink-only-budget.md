# ADR 0032 — `no-dropped-supabase-error` is `error` with a shrink-only grandfather budget

- Status: Accepted
- Date: 2026-08-30
- Deciders: TechFleet (owner)
- Related: ADR-0030 (the no-raw-invoke ratchet this mirrors exactly); ADR-0021 (observability rollout); `decisions.md §4` (Every failure reports); the 2026-08 audit (`error-handling` is the largest category, 265 findings, and this is its #1 root cause); `src/lib/observability/report.ts`, `supabase/functions/_shared/audit.ts` (withAuditWrapper); `scripts/lint/eslint-plugin-no-dropped-supabase-error.mjs`, `scripts/lint/dropped-supabase-error-grandfather.json`, `scripts/ci/check-dropped-supabase-error-budget-shrinks.mjs`.

## Context

The audit's single largest category is **error-handling (265 findings)**, and its #1 recurring shape is:

```ts
const { data } = await supabase.from("x").select(); // ❌ error dropped
```

A failed query — RLS drift (TFN hand-applies migrations, so this is a live risk), schema change, a transient `PGRST002`, a 500 — then falls through as `data === null/undefined` with **no failure signal**. This is the blank-data / infinite-skeleton class the audit flagged across pages, hooks, services, and ~50 edge functions (e.g. `DashboardPage`'s inline lookup dropping `{ error }`, and 15 sites in `techfleet-chat` alone).

The plumbing already shipped in Phase 1 gives **visibility** but does not stop the drop:

- `withAuditWrapper` (ADR-0021 D) turns an _uncaught throw_ in an edge fn into an audit row — but a dropped `{ error }` never throws.
- `report()` / the logger bridge record failures that _reach_ them — but a dropped error is never handed to them.
- React Query's global `onError` catches read failures — but only for reads that go **through** a hook/service; the direct in-component/inline calls are exactly the droppers, and moving them into hooks is **Phase 3**.

So the class needs its own structural lock now, on the layer that owns error handling, mirroring how ADR-0030 made new raw invokes impossible.

## Decision

Flip a new ESLint rule **`no-dropped-supabase-error` to `error`**, behind a **count-based, shrink-only grandfather budget**, exactly like ADR-0030:

1. **AST detection (precise, low false-positive).** The rule flags a `VariableDeclarator` whose `id` is an `ObjectPattern` that takes `data` but **not** `error` (and has no `...rest` that could carry it), whose initializer is an `await` of a **supabase-client call** — a call chain rooted at the `supabase` client (or an edge `adminClient`/`userClient`/… `createClient` result) **and** containing a supabase data method (`from/rpc/functions/select/insert/update/upsert/delete/single/maybeSingle/auth/…`). Requiring _both_ the client root and a supabase method is what keeps `useQuery`'s `{ data }`, a non-supabase `client.query()`, and `supabase.channel()` realtime from being flagged. (Verified against `techfleet-chat`: every `{ data, error }` site is skipped; only the `{ data }`-alone sites are flagged — 15/15, zero false positives.)
2. **Count-based, shrink-only budget.** `scripts/lint/dropped-supabase-error-grandfather.json` maps each file to the number of pre-existing dropped-error sites it may keep (AST-accurate, generated with the budget emptied). Any site above the count, or any in an unbudgeted file, is an error. `scripts/ci/check-dropped-supabase-error-budget-shrinks.mjs` (blocking, `gate-verify`, needs `fetch-depth: 0`) fails if any count grows or a new entry appears. Both escapes are closed: adding a dropped error → ESLint error; raising the budget to permit it → shrink-guard error.
3. **Scope: the data layer that owns error handling** — `src/services`, `src/hooks`, and edge functions (`supabase/functions`); **not** tests, and **not** UI (`src/components`/`src/pages`), whose reads migrate into hooks/services in **Phase 3** (and then inherit React Query's `onError`). The baseline is **59 files / 115 sites** — that count is the burn-down counter; it only ratchets down.

## Considered options

- **(chosen) ESLint rule = `error` + count-based shrink-only budget + shrink guard.** Mirrors the proven ADR-0030 ratchet; gives devs in-editor feedback; makes new dropped errors impossible immediately while the existing ones burn down.
- **A standalone AST CI guard (like check-report-has-no-silent-drop) instead of an ESLint rule.** Rejected — an ESLint rule gives live editor + PR feedback and matches ADR-0030's shape; the shrink guard already provides the CI ratchet half.
- **Flag `{ data }`-without-`error` everywhere, including UI.** Rejected — UI reads are Phase 3's migration target (they move into hooks and inherit `onError`); gating them now would explode the budget and duplicate Phase 3's work. Scope to the owning layer.
- **Also catch `{ data, error }` where `error` is destructured but never used.** Deferred — that requires data-flow analysis (is `error` read on every path?), which is far more false-positive-prone. The dominant, unambiguous shape (`error` not taken at all) is what this rule owns; the ignored-error form is left to `judge-arch` review + the burn-down.
- **Do nothing (rely on withAuditWrapper / report / Phase 3).** Rejected — those give visibility or are a later phase; none _stops the drop_, and this is the #1 error-handling class.

## Consequences

- **Positive:** a **directly-awaited** supabase read that drops `error` — the dominant form of the audit's #1 error-handling class — is now un-regressable for every developer (both the drop and the budget-raise are blocked in the required gate); the burn-down is measurable (115 → 0) and monotonic; it complements — does not duplicate — `withAuditWrapper`, `report()`, and Phase 3's `onError`.
- **Negative / trade-offs (honest scope):**
  - **Regenerate the budget _downward_** as sites are fixed to `{ data, error }` + handling — run ESLint with the budget **emptied** to measure true counts (a populated budget suppresses within-budget sites → zeros), same gotcha as ADR-0030.
  - **Scope is services/hooks/edge, not UI.** Dropped errors in `src/components`/`src/pages` are **not** gated by this rule yet — they are Phase 3's migration (into hooks, then `onError`). Stated so the guarantee isn't overclaimed.
  - **The ignored-`error` form is not caught** (`{ data, error }` then `error` never checked) — see options; defense-in-depth here is the burn-down review, not this rule.
  - **Indirected drops are not caught** (conservative, by design — the rule inspects the root of the _directly-awaited_ call chain): a drop behind a retry wrapper (`await withAuthLockRetry(() => supabase…)` — e.g. `mfa.service.ts`, which is frozen-auth → Phase 2-AUTH), a client bound to a non-standard name (`const sb = createClient(…)`), an intermediate variable (`const r = await supabase…; const { data } = r`), or member access (`(await supabase…).data`). All fail-safe (a miss is a no-op, never a false green / broken build) and burn down with review. Widening the rule to unwrap known retry-wrappers is a possible later step, not required for the ratchet.
  - **Edge false-positive possibility** if a non-supabase `*Client` identifier exposes a supabase-named method — mitigated by requiring both the client-root _and_ a supabase method; and a grandfathered false positive is harmless (it only occupies a budget slot, never blocks).

## Confirmation

`npx eslint .` reports **0** `no-dropped-supabase-error` violations with the budget in place; `src/test/smoke/check-dropped-supabase-error-budget-shrinks.smoke.test.ts` proves the shrink guard (raise → fail, new key → fail, shrink/hold → pass, fail-closed on missing current / unresolvable base, introduction → pass) and it discriminates under the mutation gate; `check-guard-has-test` and `check-guards-wired` cover the new guard; `tsc --noEmit` is clean. The budget total (**115**) is the burn-down counter; this ADR is complete when it reaches 0 (with UI dropped-errors closed out in Phase 3).

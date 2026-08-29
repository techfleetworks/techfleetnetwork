# ADR 0028 — The raw edge-error shape has one owner (defense-in-depth for the invoke migration)

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: ADR-0027 (codemod toolkit — "the one honest boundary" this addresses); the hardening plan's Phase 1 (raw-invoke → invokeEdge, and flipping `no-raw-functions-invoke` warn→error — **the actual structural guarantee**); `src/lib/edge/invokeEdge.ts`; `src/lib/errors/*`; the guard `scripts/ci/check-no-raw-functions-error-shape.mjs`; ADR-0024 (own an invariant at one layer).

## Context

Phase 1 routes raw `supabase.functions.invoke` calls through `invokeEdge`, which normalizes every failure into a typed `EdgeInvokeError` (`.status`, `.cause`) instead of the raw supabase `FunctionsHttpError`/`FunctionsFetchError` (`.context.status`, `.name`). ADR-0027 named the residual hazard: a _distant_ consumer might branch on the raw error shape, so normalizing the thrown value could silently change its behaviour — a whole-program property no single migration can prove.

**Where the real structural guarantee comes from.** It is _not_ a scan guard. It is the existing `no-raw-functions-invoke` lint rule: once it is `error` (Phase 1) and every call goes through `invokeEdge`, a consumer **never receives a raw supabase error at all** — `invokeEdge` only ever throws `EdgeInvokeError`. With no raw error in a consumer's hands, there is nothing raw to couple to, regardless of coding style. That is the by-construction property; it lands when Phase 1 completes the invoke migration and flips the lint. Until then, raw invokes still exist at un-migrated sites, and those consumers still receive raw errors.

**An honest measurement.** A grep for raw-shape coupling in non-owner code finds more than one site, and several use forms a line-based guard cannot see: `UserAdminPage.tsx` reads `const ctx = err.context; ctx.status === 403` (intermediate variable), `ProjectBlastComposer.tsx` does `(error as any).context` → `ctx.json()`, and a few services read `.context?.response`. These live at sites that still do raw invokes and will be migrated in Phase 1. A regex guard cannot catch intermediate-variable, aliased, or destructured access — so it must not be _claimed_ to.

## Decision

Adopt "one owner for the raw edge-error shape" as **enforced defense-in-depth for the transition**, honest about its limits:

1. The error normalization/classification layer (`src/lib/errors/**`, `transient-error.ts`, `data/transient-retry.ts`, `error-reporter.service.ts`, `invokeEdge.ts`, and the sanctioned invoke wrappers `audited-invoke.ts` / `freescoutInvoke.ts`) is the sole owner allowed to inspect the raw shape.
2. A blocking guard, `scripts/ci/check-no-raw-functions-error-shape.mjs`, fails the build if any non-owner file uses one of the **common, direct** coupling forms — `.context.status`, `["context"]`, `instanceof Functions{Http,Fetch,Relay}Error`, `.name === "Functions…Error"`. This **prevents the easy new couplings**; it does **not** catch intermediate-variable / aliased / destructured access, and does not claim to.
3. Migrate consumers as their invoke sites are migrated (TriageTab done, using `EdgeInvokeError.status` — invokeEdge propagates the HTTP status, so its 429 handling is preserved). The remaining consumers above are tracked for Phase 1.

The completeness comes from Phase 1's no-raw-invoke ban (§Context); this guard is the belt-and-suspenders that keeps the common coupling from creeping back during and after the migration.

## Considered options

- **(chosen) Owner layer + a blocking guard for the common direct couplings, honest about being incomplete; completeness delegated to the no-raw-invoke ban.** Cheap, prevents the easy regressions now, and doesn't overstate a regex's reach.
- **Claim the guard makes coupling "impossible by construction."** Rejected — it is false. A line-based guard cannot see intermediate-variable/aliased access, and live consumers use exactly those forms. Claiming completeness would be the dishonesty this project's whole gate-integrity discipline exists to prevent.
- **AST/type-aware guard that catches every access to a raw-error binding.** Deferred — that is essentially the analysis the no-raw-invoke ban makes unnecessary (no raw error reaches consumers at all). Not worth building a second whole-program analysis when Phase 1's lint flip removes the hazard at the source.
- **Make `EdgeInvokeError` shape-compatible with the raw error.** Rejected — couples the typed error to supabase's taxonomy and still breaks `instanceof`.

## Consequences

- **Positive:** the easy, common new raw-shape couplings are blocked now; error handling has a single typed contract (`EdgeInvokeError`/`toError`); once Phase 1 flips `no-raw-functions-invoke` to `error`, raw errors stop reaching consumers entirely and coupling becomes genuinely impossible — at which point this guard is redundant belt-and-suspenders.
- **Negative / trade-offs, stated plainly:** **this guard is not complete.** It catches four direct textual forms; intermediate-variable / aliased / destructured coupling passes it, and known consumers (UserAdminPage, ProjectBlastComposer, `.context?.response` services) are still coupled today at their un-migrated raw-invoke sites. "By construction" applies to the Phase-1 no-raw-invoke ban, **not** to this guard. It is also only as live as ADR-0029 (no unwired guards) + the discrimination gate keep it.

## Confirmation

`src/test/smoke/check-no-raw-functions-error-shape.smoke.test.ts` proves the guard on the forms it does cover (owner-exempt, flags `.context.status` / `instanceof` / name / bracket in a non-owner file, fail-closed) and it discriminates under the mutation gate. It runs green on the real repo and is wired into the blocking `lint-arch-critical`. Full, by-construction safety is confirmed only when Phase 1 flips `no-raw-functions-invoke` to `error` (tracked there), and this ADR should be revisited to mark the guard redundant at that point.

## Status

Phase 3 complete: silent fire-and-forget `.catch(() => {})` sweep wired `reportError(..., severity:"warn")` into 7 business-logic sites (use-explore, use-announcements, general-application syncs, explore.service persist/web/cache, ApplicationsPage loadGeneralApp). MemberWorldMap migrated to `safeRpc` so silent country-distribution RPC failures now reach triage. Intentional UI-only catches (clipboard, audio, video play, web-vitals beacon, circuit-breaker probe, local signOut) intentionally untouched — they are not signal.

## Why "Professional goals contains unsafe content" never hit triage

Two layers of silence, both fixable:

1. **Form validation rejections are swallowed.** Every `safeParse` site in the app — `ProfileSetupPage`, `EditProfilePage`, `ProfileSetupDialog`, `ProfileEditPanel`, `RegisterPage`, `ProjectFormPage`, `clients/ClientsTab`, `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage` — shows the field error to the user and `return`s. Only `feedback.service.ts` calls `reportError` on validation failure, which is the *only* reason we ever saw the matching feedback row in triage at all.
2. **Edge functions are mostly unwrapped.** `withAuditWrapper` (the thing that emits `edge_function_error` on uncaught throws) is used in **1 of ~75 edge functions**. The other 74 die silently with whatever `try/catch` they happen to have.

There are also smaller gaps that compound the problem (suppression list, dedup/rate-limit drops, fire-and-forget `.catch(() => {})` calls, no schema-rejection event type).

## Audit results — where we lose errors today

### A. Frontend (client-side)

| Surface | Reaches `audit_log` / triage? | Notes |
|---|---|---|
| `window.error` | ✅ via `installGlobalErrorReporter` | Suppressed for extension URLs and patterns in `SUPPRESSED_PATTERNS` |
| `window.unhandledrejection` | ✅ | Same suppression list |
| Programmatic `reportError(...)` | ✅ | Only 9 files use it; mostly auth + feedback + push |
| **Zod `safeParse` failures** | ❌ | Surfaced to user, never reported. Root cause of the user's missed bug |
| React Query `onError` | ⚠️ partial | Some hooks call `reportError`, most rely on toast only |
| `.catch(() => {})` fire-and-forget | ❌ | e.g. `generate-discord-invite` invoke in `ProfileSetupPage` line 198 |
| Service-layer thrown errors | ⚠️ | Only services that explicitly call `reportError` get logged |
| Suppression-pattern drops | ❌ | Silent — no counter, no sample, no escape hatch |
| Dedup + rate-limit drops | ⚠️ | Rate-limit emits `client_error_overflow`; **dedup drops are invisible** |

### B. Backend (edge functions)

| Surface | Reaches triage? | Notes |
|---|---|---|
| Functions wrapped with `withAuditWrapper` | ✅ | **1/75** today |
| Functions with bare `Deno.serve(...)` and ad-hoc try/catch | ⚠️ | Catches that return 500 don't write to audit_log unless author remembered to |
| Functions that swallow downstream errors (`catch { return ok }`) | ❌ | Common in fire-and-forget Discord/email paths |
| External API timeouts inside CircuitBreaker | ⚠️ | Recovery is logged (`external_api_recovered`); failures are not always |
| Cron / scheduled functions | ⚠️ | No standard wrapper; a thrown error often just dies in the scheduler log |

### C. Database / RPC

| Surface | Reaches triage? | Notes |
|---|---|---|
| RPC throws an exception → service caller catches | ⚠️ | Only logged if caller calls `reportError` |
| Trigger raises EXCEPTION | ❌ | Lost unless the calling function is wrapped |
| RLS deny on a user action | ❌ | Treated as "expected" today; we have no visibility |

### D. Triage queue gating

`writeAudit` (line 218) only inserts into `agent_fix_queue` when `severity !== "info" && eventType !== "client_error_overflow"`. So:
- `reportActivity(... severity:"info")` events never appear in triage even when they should (e.g. `session_idle_timeout` clusters indicating a real problem).
- We have no `validation_rejected` event type at all — so even if we *did* call `reportError` from form sites, it would land as `client_error` and look like a JS bug rather than a UX/regex bug.

## Plan — close every gap, no UX regression

### 1. New event type + helper for validator rejections
- Add `validation_rejected` to `ReportEventType` in `error-reporter.service.ts`.
- Add `reportValidationRejection(schemaName, issues, source, opts?)` helper that:
  - Fingerprints by `schemaName + first issue path + first issue code` so a recurring false-positive aggregates to one queue row.
  - Sends `severity: "warn"` (not "error" — these aren't crashes, but are high-signal UX bugs we always want to see).
  - Always lands in triage (relax the gate so `warn` is included; see §6).
- Wire it into a single shared utility: `withValidationReporting(schema, source)` that wraps `safeParse` and reports on failure. Drop-in replacement at every call site.

### 2. Wire validation reporting into every form
Targeted edits at each `safeParse` site listed in the audit. The user-visible behavior is unchanged — we only add a fire-and-forget `reportValidationRejection` call before the existing `setErrors`/`scrollToFirstError` flow.

### 3. Wrap every edge function with `withAuditWrapper`
- Codemod / scripted pass over `supabase/functions/*/index.ts` to replace `Deno.serve(handler)` with `Deno.serve(withAuditWrapper("<fn-name>", handler))`.
- Skip the public unauth ones already audited inside.
- For functions that already have a custom try/catch, keep the inner one but still wrap so uncaught paths get logged.
- Add an ESLint rule (or simple repo grep CI check) that fails if a new function under `supabase/functions/` is added without `withAuditWrapper`.

### 4. Fire-and-forget `.catch(() => {})` audit
- Grep for `.catch(() => {})` and `.catch(() => undefined)`. Replace with `.catch((e) => reportError(e, "<source>", { severity: "warn" }))`.
- Keep the swallow for the user UX (no toast), just stop swallowing the *log*.

### 5. Make suppression observable
- Add a tiny per-pattern counter inside `isSuppressed`. Once a minute, if count > 0, emit a single `client_error_suppressed` audit row with `pattern:<name>` and `count:N` so admins can see what's being filtered and confirm the suppression list is still correct.
- Same for dedup drops: emit `client_error_deduped` with `count:N` once a minute.
- Both go to triage as `warn` so a sudden spike (like a new browser-extension breaking us) is visible without flooding.

### 6. Triage gate: include `warn`
- Update `writeAudit` so the `agent_fix_queue` insert runs for `severity !== "info"` **OR** `eventType IN ('validation_rejected', 'client_error_suppressed', 'client_error_deduped')`. Today only `error` reaches it; `warn` is invisible.
- System Health "Triage" tab gets two new chips: "Validation rejections", "Suppressed/deduped" so an admin can spot regex false-positives like the one this week within minutes.

### 7. Server-side coverage for swallowed RPC errors
- New helper `safeRpc(rpcName, args)` in `src/lib/supabase/safe-rpc.ts` that wraps `supabase.rpc(...)` and calls `reportError` on the returned `{ error }`. Migrate the highest-traffic call sites (profile, application, feedback, journey, quest) — leave low-risk calls alone to keep noise down.

### 8. BDD scenarios (per workspace rule)

Insert into `bdd_scenarios` with tri-layer Then assertions:
- `BTRG-020` Validator rejection of legit input lands in triage as `validation_rejected`.
- `BTRG-021` Edge function uncaught throw lands as `edge_function_error` (covers the `withAuditWrapper` rollout).
- `BTRG-022` Suppressed pattern emits `client_error_suppressed` aggregate once per minute.
- `BTRG-023` Triage UI "Validation rejections" chip shows the new event type.
- `BTRG-024` `.catch(() => {})` replacements in fire-and-forget calls produce a `warn` audit row on failure.

### 9. Verification
- Unit: `reportValidationRejection` fingerprinting + severity.
- Manual: paste the user's original feedback text into the Profile `professional_goals` field with the *old* (newline-rejecting) regex temporarily re-enabled in a test build → confirm the queue row appears within 60s as `validation_rejected`.
- Operational: 24h after rollout, check `agent_fix_queue` for new `validation_rejected` and `client_error_suppressed` rows; tune suppression list if anything noisy.

## Files in scope (preview)

- `src/services/error-reporter.service.ts` — new event types, helper, gate update, suppression/dedup counters.
- `src/lib/forms/with-validation-reporting.ts` — new wrapper.
- ~10 form components/pages — one-line wiring.
- `supabase/functions/_shared/audit.ts` — no change (already correct).
- ~74 edge functions — wrap with `withAuditWrapper`.
- `src/components/system-health/TriageTab.tsx` — new chips/filters.
- One DB migration: insert BDD scenarios.
- No schema changes required — `audit_log` and `agent_fix_queue` already accept the new event_type strings.

No UX regression: every change is additive (extra logging) or invisible (severity gate widened, triage chips added). The user sees the same field errors, toasts, and form behavior they see today.

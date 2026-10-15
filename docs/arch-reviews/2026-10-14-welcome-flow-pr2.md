# Arch review — Welcome Flow PR2 (service seam + routed flow shell + steps a/c)

- **Date:** 2026-10-14
- **Change:** `3be165aa` on `feat/welcome-flow-pr2-screens` (vs `origin/main`)
- **Review mode:** fresh-context subagent (general-purpose), relayed by `judge-arch`
- **Verdict: PASS** — 0 blocking, 3 advisory. Matrix: 15 files × 4 questions = 60 cells (57 cleared, 3 advisory).
- **Mechanical gate:** `node scripts/ci/arch-gate.mjs --changed` → PASS, 15 files, exit 0.

## Four questions

- **Boundary placement — cleared.** Components render/format only; nav mechanics are pure functions in `navigation.ts`; all DB access is behind `ProfileService` + the hook. No supabase import in `src/components/welcome`.
- **Data ownership — cleared.** `welcome_flow_completed_at` has exactly one writer (`mark_welcome_flow_complete()` RPC via `ProfileService.markWelcomeFlowComplete`); it is **not** in the `updateFields` allow-list; the completion count is live-derived (no `welcome_flow_stats` counter). The step registry is the single source for the step count.
- **Dependency direction — cleared.** `profile.service.ts` imports nothing from react/react-router/DOM. The welcome dir imports `@/design-system` only (no `lucide-react`, no `@/components/ui`). `document.getElementById` appears once, in a component (permitted).
- **Error handling — cleared.** The bounded write throws on error and beacons via `record_event`; the count read reports through `handleServiceError` and throws (see N3). The telemetry beacon is best-effort fire-and-forget (acceptable).

## Advisory findings

| id | question | sev | file | disposition |
|----|----------|-----|------|-------------|
| N1 | over-engineering | low | completion-count hook/RPC + markWelcomeFlowComplete | **Accepted** — deliberate phased delivery; §16 scopes the single-writer seam into PR2. |
| N2 | dependency (typing) | info | `profile.service.ts` `(supabase as any).rpc` | **Accepted** — interim until supabase types are regenerated; matches existing repo convention. |
| N3 | error-handling | info | `getWelcomeFlowCompletionCount` | **Fixed** — now wraps `handleServiceError` for reporting parity with `stats.service.ts`. |

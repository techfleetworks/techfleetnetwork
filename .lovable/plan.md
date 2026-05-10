## Problem

After a deploy, browser tabs that still hold the old `index.html` request asset filenames (e.g. `NetworkActivity-CisYQrdm.js`, `FleetyChatWidget-BvTBk0Rc.js`) that no longer exist on the server. This bubbles a `TypeError: error loading dynamically imported module` and triggers the dashboard's `ErrorBoundary`. We've seen 11 of these on the Dashboard in 24h.

The `lazyWithRetry` safety net (2 retries + one-time hard reload) is wired into every route in `src/App.tsx`, but **inner-component** lazies still use raw `React.lazy`, so they bypass the retry/reload guard:

- `src/pages/DashboardPage.tsx` → `NetworkActivity`, `SystemHealthWidget`
- `src/components/AppLayout.tsx` → `FleetyChatWidget` (3 mount points)
- `src/components/NetworkActivity.tsx` → `MemberWorldMap`
- `src/pages/LandingPage.tsx` → `NetworkActivity`
- `src/pages/ApplicationsPage.tsx` → `SubmittedApplicationsTab`
- `src/pages/GeneralApplicationPage.tsx` → `GeneralApplicationTab`
- `src/pages/RosterProjectDetailPage.tsx` → `ProjectAnalysisContent`, `ProjectRosterContent`
- `src/pages/UpdatesPage.tsx` → `MediaRecorder`

These are exactly the chunks showing up in the error reports.

## Fix

Swap the raw `React.lazy` import for the existing `lazyWithRetry` helper in every inner-component lazy callsite above. The helper already:

1. Retries the dynamic import twice (400ms, 1200ms backoff)
2. Hard-reloads once via `sessionStorage["__lovable_chunk_reload__"]` to prevent loops
3. Cooperates with `RouteChangeReloader` / `deploy-watcher` (no behavior change)

No new dependencies, no UX change on the happy path. The first time a stale-chunk error hits one of these widgets, it will silently retry → reload → the user lands on the fresh build instead of seeing the boundary.

## Files to edit

| File | Change |
|---|---|
| `src/pages/DashboardPage.tsx` | Replace `import { ..., lazy, ... } from "react"` → keep React imports, add `import { lazyWithRetry as lazy } from "@/lib/lazy-with-retry"` |
| `src/components/AppLayout.tsx` | Same swap |
| `src/components/NetworkActivity.tsx` | Same swap |
| `src/pages/LandingPage.tsx` | Same swap |
| `src/pages/ApplicationsPage.tsx` | Same swap |
| `src/pages/GeneralApplicationPage.tsx` | Same swap |
| `src/pages/RosterProjectDetailPage.tsx` | Same swap |
| `src/pages/UpdatesPage.tsx` | Same swap |

## Verification

- TypeScript build passes (auto-run by harness).
- Manually grep: zero remaining raw `lazy(` callsites outside `src/lib/lazy-with-retry.ts` and `src/App.tsx`.
- Re-check audit log after next deploy — `ui_render_error` count for `dynamically imported module` should drop to ~0.

## Memory update

After implementation, append to `mem://tech/deployment/stale-chunk-prevention` rule #4: "lazyWithRetry MUST also wrap inner-component lazies (widgets/tabs), not just route lazies in App.tsx."
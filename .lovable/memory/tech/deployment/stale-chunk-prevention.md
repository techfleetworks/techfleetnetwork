---
name: Stale chunk prevention
description: Multi-layer system that prevents post-deploy "Failed to fetch dynamically imported module" errors from ever surfacing to users
type: feature
---
# Stale-chunk prevention (deploy resilience)

Goal: a redeploy must NEVER cause a `TypeError: Failed to fetch dynamically imported module` for an open browser tab.

## Layers (defense in depth)

1. **Cache headers (`public/_headers`)**
   - `/assets/*` → `public, max-age=31536000, immutable` (filenames are content-hashed by Vite, safe to cache forever).
   - `/version.json`, HTML, `/sw.js`, `/sw-push.js` → `no-cache, no-store, must-revalidate`.
   - PWA service workers stay disabled (`src/main.tsx` unregisters any SW on load).

2. **Build identifier**
   - `vite.config.ts` injects `__BUILD_ID__` via `define` and emits `dist/version.json` (`{ buildId, builtAt }`) via the `emitVersionManifest` plugin.
   - Build id source order: `VITE_BUILD_ID` → `COMMIT_REF` → `VERCEL_GIT_COMMIT_SHA` → `GITHUB_SHA` → `Date.now()`.

3. **Proactive deploy watcher (`src/lib/deploy-watcher.ts`)**
   - Started from `src/main.tsx` via `startDeployWatcher()`.
   - Polls `/version.json` on focus, `online`, visibilitychange, and every 60s.
   - On mismatch: reload immediately if hidden, otherwise schedule idle reload + reload on next route change (`src/components/RouteChangeReloader.tsx`).

4. **Lazy import retry safety net (`src/lib/lazy-with-retry.ts`)**
   - Wraps every `React.lazy` route in `src/App.tsx` (imported as `lazy`).
   - Two transient retries with backoff (400ms, 1200ms) before a single hard reload tracked via `sessionStorage["__lovable_chunk_reload__"]` to prevent loops.
   - `clearChunkReloadFlag()` is called by `RouteChangeReloader` on successful navigations.

5. **ErrorBoundary backstop (`src/components/ErrorBoundary.tsx`)**
   - Detects chunk-load errors and silently hard-reloads as final recovery.

## Rules when changing build/deploy code
- Do NOT remove `__BUILD_ID__` injection or the `version.json` emitter.
- Do NOT cache `/version.json` or HTML.
- Do NOT remove `lazyWithRetry` from `src/App.tsx` route imports.
- Do NOT re-enable a service worker that caches JS chunks.
- If you add a new entry point or split bundles differently, keep filenames content-hashed (Vite default).

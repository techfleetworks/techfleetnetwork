---
name: Firefox stale-chunk reload loop fix
description: Inline chunk-404 reloader in index.html must stay scoped to pre-mount only — otherwise Firefox's bubbled dynamic-import error events trap users in "every click goes back to /dashboard"
type: constraint
---
# Firefox stale-chunk redirect loop — do not regress

## Symptom
On Firefox, every link click sends a signed-in user back to whatever route
they were on (commonly `/dashboard`). URL ends up with `?_r=<timestamp>`.
Other browsers behave normally.

## Root cause
Firefox dispatches a bubbling `error` event on the `<script>` tag for
**every** failed dynamic import (React Router lazy chunks). Chrome and
Safari only surface it as a promise rejection, which `lazyWithRetry`
catches.

The inline blank-screen recovery script in `index.html` listens to those
`error` events and `window.location.replace`'s to the **current** URL
(pre-navigation). React Router has not committed yet, so the user lands
right back where they started.

## Invariants (must hold)
1. `index.html` inline `error` handler MUST early-return when
   `window.__tfnAppMounted === true` or `<html data-tfn-mounted="1">` is set.
2. `index.html` inline `isChunk404()` MUST ignore URLs containing
   `?_n=` or `?__r=` (lazyWithRetry's own retry cache-busters).
3. `src/main.tsx` MUST set `window.__tfnAppMounted = true` and
   `document.documentElement.dataset.tfnMounted = '1'` immediately after
   `createRoot().render(...)`.
4. Recovery flag (`__tfn_blank_recovery_reload__`) MUST be cleared only
   after a mounted + 10s settle window — never on raw `load`. Clearing on
   `load` re-arms the loop after each reload.

Smoke test: `src/test/smoke/firefox-chunk-reload.smoke.test.ts`
BDD: FIREFOX-CHUNK-001..004

---
name: Graceful degradation for read-only widgets
description: Public/dashboard read-only widgets (stats, counts, listings) must cache last-known data in localStorage and render it on fetch failure instead of an empty error state
type: preference
---

For public-facing or dashboard read-only widgets backed by an RPC or query
(e.g. Network Activity / `get_network_stats`, future homepage counters):

1. Cache successful payloads in `localStorage` under a versioned key
   (`tfn:<feature>:last-known:v1`) with a `cachedAt` timestamp.
2. On fetch failure, return the cached payload (max age 7 days) instead of
   throwing.
3. UI should render the cached data with a subtle, accessible "Showing last
   known…" notice (`role="status" aria-live="polite"`) — never a hard error
   block when cache exists.
4. Only show the hard-error empty state when there is truly no cache (true
   first visit + failure).
5. Expose `getCached…()` on the service so the UI can also fall back if the
   service-layer cache miss bubbles an error.

**Why:** matches `mem://constraints/no-ux-regression` — a permission revoke,
key rotation, or transient network issue must not blank out a public widget.

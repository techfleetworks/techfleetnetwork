
-- ============================================================================
-- Manual triage pass — May 9, 2026
-- All 6 pending items are known patterns, not novel bugs. Annotate each row
-- with root cause + proposed action, then move to the appropriate terminal
-- status. No production code changes are required.
-- ============================================================================

-- 1) Lock broken by another request — suppressed Supabase auth lock noise.
--    Working as intended; the suppression policy itself surfaced this.
UPDATE public.agent_fix_queue
SET
  root_cause_hypothesis = 'Benign: Supabase JS auth lock contention when multiple tabs/components race for the same session. The error-reporter suppression policy already filters this; the surfaced row is the suppression *summary*, not a real failure.',
  proposed_fix_summary  = 'No code change. Working as designed — the suppression pipeline already absorbs this noise. Dismissed as not-a-bug.',
  proposed_fix_files    = '[]'::jsonb,
  triaged_at            = now(),
  status                = 'dismissed',
  dismissed_at          = now(),
  dismissed_reason      = 'not_a_bug: suppression summary, not a real failure'
WHERE fingerprint = 'client_error_suppressed::error-reporter.suppression::1 client error(s) suppressed by pattern "Lock broken by another request"';

-- 2) LinkedIn URL validation rejected — Zod schema correctly rejected an
--    invalid URL the user typed. validation_rejected events are evidence the
--    guardrails work; they are not bugs.
UPDATE public.agent_fix_queue
SET
  root_cause_hypothesis = 'User submitted a LinkedIn URL without http(s):// prefix; the profileSchema validator correctly rejected it and surfaced an inline form error.',
  proposed_fix_summary  = 'No code change. Validation worked as intended. (If we ever want to soften UX, we could auto-prefix https:// — tracked separately, not a bug.)',
  proposed_fix_files    = '[]'::jsonb,
  triaged_at            = now(),
  status                = 'dismissed',
  dismissed_at          = now(),
  dismissed_reason      = 'working_as_intended: client-side validation correctly rejected bad input'
WHERE fingerprint = 'validation_rejected::ProfileSetupPage.handleSubmit::[profileSchema] linkedin_url: LinkedIn URL must start with http:// or https://';

-- 3) TypeError: Failed to fetch — `list` (8 occurrences)
-- 4) TypeError: Failed to fetch — `getReadIds` (1 occurrence)
-- 6) NetworkError — `query.admin-role.<userid>` (1 occurrence)
--    All three are the same class: transient browser-side fetch failure
--    (offline blip, captive portal, tab backgrounded, mid-flight refresh).
--    CircuitBreaker + react-query retries already absorb these. Mark resolved
--    with a clear note so we don't re-triage the next time they appear.
UPDATE public.agent_fix_queue
SET
  root_cause_hypothesis = 'Transient client-side network failure (browser offline, sleep/wake, captive portal, or page navigation aborted in-flight). Affects any fetch — Supabase REST, edge functions, static assets — equally.',
  proposed_fix_summary  = 'No code change. Already mitigated by react-query exponential backoff + CircuitBreaker self-heal logging. Resolved as a known transient-network class. Re-open only if rate spikes >50/day for one fingerprint.',
  proposed_fix_files    = '[]'::jsonb,
  triaged_at            = now(),
  status                = 'resolved',
  resolved_at           = now()
WHERE fingerprint IN (
  'client_error::list::TypeError: Failed to fetch',
  'client_error::getReadIds::TypeError: Failed to fetch',
  'client_error::query.admin-role.eb28289b-daf3-4242-9d23-9cb29875444f::{"message":"TypeError: NetworkError when attempting to fetch resource.","details":"","hint":"","code":""}'
);

-- 5) Stale chunk: NetworkActivity-ZUr-eILG.js failed to load (2 occurrences).
--    Classic Vite hashed-chunk staleness right after a deploy when the user's
--    open tab still references an old asset filename. Already mitigated by
--    PWA service worker / Workbox being disabled (per
--    mem://tech/deployment/cache-invalidation and
--    mem://tech/deployment/stale-chunk-prevention). The remaining surface is
--    the unavoidable "tab open during deploy" race; ErrorBoundary already
--    catches it and offers a refresh.
UPDATE public.agent_fix_queue
SET
  root_cause_hypothesis = 'Stale Vite chunk: user had /dashboard open across a deploy and the lazy-loaded NetworkActivity bundle was rotated to a new content hash. PWA/Workbox is intentionally disabled so on next reload they get the fresh manifest.',
  proposed_fix_summary  = 'No code change. ErrorBoundary already catches the dynamic-import failure on /dashboard. Resolved as known deploy-race pattern. If frequency spikes, revisit forced reload-on-chunk-error in ErrorBoundary.',
  proposed_fix_files    = '[]'::jsonb,
  triaged_at            = now(),
  status                = 'resolved',
  resolved_at           = now()
WHERE id = 'd1d4a22f-79de-4ee8-8040-c15a23d5fc6c';

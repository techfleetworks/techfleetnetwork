-- 1) Silence housekeeping audit events from the triage queue going forward.
-- These are maintenance writes (orphan reconciliation, account deletion bookkeeping),
-- not user-facing errors. They should never fan out to admin push or AI triage.
INSERT INTO public.known_issue_catalog
  (pattern, match_kind, event_type_filter, reason, accepted_at, is_active)
VALUES
  ('Auth row had no matching public.profiles row',
   'substring',
   'orphan_auth_user_purged',
   'Janitor: nightly orphan reconciliation. Maintenance, not an error.',
   now(),
   true)
ON CONFLICT (pattern, match_kind, event_type_filter)
DO UPDATE SET is_active = true, reason = EXCLUDED.reason, accepted_at = now();

-- 2) Also silence the stale "coordinator-for-app" client_error fingerprint —
-- the underlying PGRST116 was caused by a `.single()` on a project with no
-- coordinator. Code now uses `.maybeSingle()` (ProjectApplicationPage.tsx),
-- so any new occurrence would indicate a regression we want to see again.
-- We silence ONLY the historical fingerprint, not the event_type, so real
-- client errors keep reporting normally.
INSERT INTO public.known_issue_catalog
  (pattern, match_kind, event_type_filter, reason,
   accepted_at, is_active, expires_at)
VALUES
  ('client_error::query.coordinator-for-app.52ffef70-521d-4db1-8a18-f7ead4ac82c2::{"code":"PGRST116","details":"The result contains 0 rows","hint":null,"message":"Cannot coerce the result to a single JSON object"}',
   'substring',
   'client_error',
   'Resolved: ProjectApplicationPage now uses maybeSingle for missing coordinator. Silencing stale fingerprint for 30 days.',
   now(), true, now() + interval '30 days');

-- 3) Resolve the existing queue entries so the Triage tab is clean.
UPDATE public.agent_fix_queue
   SET status = 'resolved',
       resolved_at = now(),
       updated_at = now()
 WHERE id IN (
   'f37613ae-0151-4a51-bd2e-452d4e223459',  -- coordinator-for-app stale
   '579210e8-ac8d-4297-bf68-f8deaa2879b2'   -- orphan_auth_user_purged housekeeping
 );
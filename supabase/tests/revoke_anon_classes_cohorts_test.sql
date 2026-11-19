-- pgTAP: after the A6 REVOKE, the anon role has NO privileges on classes/cohorts,
-- so the only way an anonymous visitor can read class data is through a
-- service-role gateway (which applies the §6 allowlist). Run: `supabase db test`.
BEGIN;
SELECT plan(4);

-- Exactly-zero privileges for anon on each table (the D-A lockdown).
SELECT table_privs_are(
  'public', 'classes', 'anon', ARRAY[]::text[],
  'anon has no privileges on public.classes'
);
SELECT table_privs_are(
  'public', 'cohorts', 'anon', ARRAY[]::text[],
  'anon has no privileges on public.cohorts'
);

-- And explicitly: anon cannot SELECT (the leak the gateway closes).
SELECT ok(
  NOT has_table_privilege('anon', 'public.classes', 'SELECT'),
  'anon cannot SELECT public.classes'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.cohorts', 'SELECT'),
  'anon cannot SELECT public.cohorts'
);

SELECT * FROM finish();
ROLLBACK;

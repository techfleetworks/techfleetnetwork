-- pgTAP: projects.is_shipathon column + reachability (ADR-0054).
-- Run: `supabase db test`. Proves the Shipathon flag exists as boolean NOT NULL DEFAULT false and
-- is SELECT-able by the `authenticated` role (the applicant application flow reads it via
-- projects.select('*')), and is NOT readable by `anon`. The `authenticated` SELECT is the guard
-- against the silent-off failure: if the column were unreadable, the flag would read undefined and
-- the feature would quietly disable itself. Rolled back at the end.

BEGIN;
SELECT plan(6);

-- 1. Column exists.
SELECT has_column('public', 'projects', 'is_shipathon', 'projects.is_shipathon exists');

-- 2. Boolean type.
SELECT col_type_is('public', 'projects', 'is_shipathon', 'boolean', 'is_shipathon is boolean');

-- 3. NOT NULL (so reads/writes never yield null; omission inserts the default).
SELECT col_not_null('public', 'projects', 'is_shipathon', 'is_shipathon is NOT NULL');

-- 4. Defaults false (opt-in: existing and new projects are non-Shipathon unless enabled).
SELECT col_default_is('public', 'projects', 'is_shipathon', 'false', 'is_shipathon defaults false');

-- 5. The applicant role can read it — the reachability guarantee behind the feature.
SELECT ok(
  has_column_privilege('authenticated', 'public.projects', 'is_shipathon', 'SELECT'),
  'authenticated can SELECT projects.is_shipathon (applicant read path)'
);

-- 6. anon cannot read it (anon is revoked from projects; public reads go via the edge function).
SELECT ok(
  NOT has_column_privilege('anon', 'public.projects', 'is_shipathon', 'SELECT'),
  'anon cannot SELECT projects.is_shipathon'
);

SELECT * FROM finish();
ROLLBACK;

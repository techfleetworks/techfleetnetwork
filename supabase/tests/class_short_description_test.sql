-- pgTAP: classes.short_description length CHECK (public-access A1).
-- Run: `supabase db test` (or pg_prove) against a DB with the migrations applied.
-- Proves the 140-char DB ceiling is enforced at the data layer, independent of the
-- client validator. Runs in a rolled-back transaction.

BEGIN;
SELECT plan(2);

-- Skip slug/validation triggers for deterministic setup; CHECK constraints are
-- still enforced under session_replication_role = replica.
SET session_replication_role = replica;

INSERT INTO auth.users (id, email)
VALUES ('a1a1a1a1-0000-0000-0000-000000000001', 'sd-a1@example.com')
ON CONFLICT (id) DO NOTHING;

-- 140 characters is allowed.
SELECT lives_ok(
  $$INSERT INTO public.classes (id, owner_user_id, track, title, slug, summary, short_description, status)
    VALUES ('a1000000-0000-0000-0000-000000000001',
            'a1a1a1a1-0000-0000-0000-000000000001', 'basic_training',
            'Short desc ok', 'sd-ok-a1-test', repeat('s', 30),
            repeat('x', 140), 'draft')$$,
  'short_description of 140 chars is accepted'
);

-- 141 characters violates classes_short_description_len (SQLSTATE 23514).
SELECT throws_ok(
  $$INSERT INTO public.classes (id, owner_user_id, track, title, slug, summary, short_description, status)
    VALUES ('a1000000-0000-0000-0000-000000000002',
            'a1a1a1a1-0000-0000-0000-000000000001', 'basic_training',
            'Short desc too long', 'sd-bad-a1-test', repeat('s', 30),
            repeat('x', 141), 'draft')$$,
  '23514',
  'short_description over 140 chars is rejected by the CHECK'
);

SELECT * FROM finish();
ROLLBACK;

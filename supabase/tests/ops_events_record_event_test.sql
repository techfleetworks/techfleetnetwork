-- pgTAP suite for the ops_events telemetry 400-drop (2026-09-22).
-- Run: `supabase test db` against a migrated DB. Rolled back at the end.
--
-- Proves the contract the email-v2 sink drifted from:
--   (1) ops_events has NO `source` column — the sink's top-level `source` was the
--       PostgREST PGRST204 (HTTP 400) that silently dropped every telemetry row;
--   (2) a raw insert naming `source` fails at the DB with 42703 (undefined_column)
--       — the SQL-level mirror of that 400;
--   (3) the corrected path — record_event('ops_events', …), the single write path,
--       callable by service_role — succeeds and carries `source` inside payload.

BEGIN;
SELECT plan(6);

-- ── 1-3. Schema shape: the columns the write path may name, and the one it may not
SELECT has_column('public', 'ops_events', 'kind',    'ops_events.kind exists');
SELECT has_column('public', 'ops_events', 'payload', 'ops_events.payload exists (source metadata rides here)');
SELECT hasnt_column('public', 'ops_events', 'source',
  'ops_events has NO source column — a top-level source is the PGRST204 root cause');

-- ── 4. The exact failure the sink hit, at the DB layer (42703 = undefined_column)
SELECT throws_ok(
  $$ INSERT INTO public.ops_events (kind, source) VALUES ('test.ops_events.badcol', 'email-v2') $$,
  '42703', NULL,
  'a direct insert naming source fails with undefined_column (the HTTP 400 in the logs)');

-- ── 5. The corrected path: record_event is the single write path, granted to service_role
SET LOCAL role service_role;
SELECT lives_ok(
  $$ SELECT public.record_event(
       'ops_events', 'test.ops_events.roundtrip', NULL,
       '{"template":"welcome","lane":"transactional","source":"email-v2"}'::jsonb, 'info') $$,
  'record_event(ops_events, …) inserts via the single write path as service_role');
RESET role;

-- ── 6. source is preserved — folded into payload (JSONB), not lost
SELECT is(
  (SELECT payload->>'source' FROM public.ops_events WHERE kind = 'test.ops_events.roundtrip'),
  'email-v2',
  'the emitting subsystem is preserved inside payload.source');

SELECT * FROM finish();
ROLLBACK;

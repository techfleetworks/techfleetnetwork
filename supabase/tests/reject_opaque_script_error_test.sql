-- pgTAP: reject_opaque_script_error BEFORE INSERT trigger (TRIAGE-NOISE-033).
--
-- This is the SINGLE OWNER of the invariant "no opaque cross-origin 'Script error.'
-- row is ever stored". The trigger fires BEFORE INSERT on both audit_log and
-- agent_fix_queue and silently drops (RETURN NULL) any row whose first non-empty
-- error_message line is an opaque "Script error." — while letting real errors
-- through untouched. The browser-side JS filter (isOpaqueScriptErrorMessage) is
-- only an early-drop optimization; this trigger is the permanent backstop
-- (see migration 20260602194357 and known_issue_catalog 'Script error.').
--
-- It replaces the former after-the-fact CI monitor
-- scripts/ci/check-no-opaque-script-error.mjs, which was UNWIRED (ran in no
-- workflow, verified nothing) and could not be given a discriminating test
-- without a live DB. Proving the enforcement at the layer that owns it — here,
-- in the wired db-test job — is a strictly stronger guarantee. See ADR-0024,
-- decisions.md §6.
--
-- Wrapped in a txn; rolls back — no persisted changes.
BEGIN;
SELECT plan(9);

SELECT has_function(
  'public', 'reject_opaque_script_error', 'the permanent backstop trigger fn exists');

-- ---- audit_log: opaque rows are silently dropped (trigger RETURN NULL) --------
INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
VALUES ('zzguard', 'zzguard', 'opaque-dot', 'Script error.');
SELECT is(
  (SELECT count(*) FROM public.audit_log WHERE record_id = 'opaque-dot'),
  0::bigint, 'audit_log: bare "Script error." is dropped');

INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
VALUES ('zzguard', 'zzguard', 'opaque-prefix', 'error: Script error.');
SELECT is(
  (SELECT count(*) FROM public.audit_log WHERE record_id = 'opaque-prefix'),
  0::bigint, 'audit_log: the "error: Script error." prefix form is dropped');

INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
VALUES ('zzguard', 'zzguard', 'opaque-noperiod', 'Script error');
SELECT is(
  (SELECT count(*) FROM public.audit_log WHERE record_id = 'opaque-noperiod'),
  0::bigint, 'audit_log: "Script error" without a trailing period is dropped');

INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
VALUES ('zzguard', 'zzguard', 'opaque-ws', e'\n   Script error.  ');
SELECT is(
  (SELECT count(*) FROM public.audit_log WHERE record_id = 'opaque-ws'),
  0::bigint, 'audit_log: a leading blank line + surrounding whitespace is still dropped');

-- ---- audit_log: real errors are KEPT — discrimination, not a blanket drop -----
INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
VALUES ('zzguard', 'zzguard', 'real-err', e'TypeError: cannot read x\n    at foo (bar.js:1:1)');
SELECT is(
  (SELECT count(*) FROM public.audit_log WHERE record_id = 'real-err'),
  1::bigint, 'audit_log: a real stack-trace error is inserted normally');

INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
VALUES ('zzguard', 'zzguard', 'not-first', e'Real failure happened\nScript error.');
SELECT is(
  (SELECT count(*) FROM public.audit_log WHERE record_id = 'not-first'),
  1::bigint, 'audit_log: "Script error." only on a later line is kept (first-line specific)');

-- ---- agent_fix_queue: the same backstop on the second guarded table -----------
INSERT INTO public.agent_fix_queue (fingerprint, event_type, source, error_message)
VALUES ('zzguard-opaque', 'zzguard', 'zzguard', 'Script error.');
SELECT is(
  (SELECT count(*) FROM public.agent_fix_queue WHERE fingerprint = 'zzguard-opaque'),
  0::bigint, 'agent_fix_queue: bare "Script error." is dropped');

INSERT INTO public.agent_fix_queue (fingerprint, event_type, source, error_message)
VALUES ('zzguard-real', 'zzguard', 'zzguard', e'ReferenceError: y is not defined\n    at baz');
SELECT is(
  (SELECT count(*) FROM public.agent_fix_queue WHERE fingerprint = 'zzguard-real'),
  1::bigint, 'agent_fix_queue: a real error is inserted normally');

SELECT * FROM finish();
ROLLBACK;

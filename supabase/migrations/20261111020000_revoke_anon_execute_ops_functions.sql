-- RP-I / DB-1 burndown — batch 6: revoke anon EXECUTE on the remaining ops/monitoring + missed-trigger fns.
--
-- Batches 1-5 took the anon-exposed SECURITY DEFINER inventory 76 -> 29. This batch clears the last 6
-- burn-down-able entries (the rest of the 29 are intentional public RPCs or out of scope — auth/stats).
-- All 6 are public SECURITY DEFINER and anon-exposed only via the residual direct default-privilege grant;
-- a per-caller analysis found NONE is legitimately invoked by anon (no logged-out RPC path, and no anon/
-- public RLS policy references any of them). So `REVOKE EXECUTE ... FROM anon, PUBLIC` aligns the grant
-- with the real callers.
--
-- THE 6 (verdict: revoke anon; role(s) the real callers need, preserved + asserted below):
--   get_stuck_pending_email_count(integer)   admin System Health card -> authenticated (+ service_role)
--   community_events_staleness_check()        pg_cron every 15 min (runs as owner) -> no caller role needed
--   fill_content_gaps_check_and_inc(integer)  service_role worker only -> service_role
--   class_item_release(uuid, uuid)            nested in get_class_curriculum_for_learner (as owner) + RLS
--                                             policies, all TO authenticated -> authenticated (+ service_role)
--   get_class_curriculum_for_learner(uuid)    learner/editor view rpc; raises auth_required when uid NULL
--                                             -> authenticated (+ service_role)
--   trg_general_app_submitted()               AFTER INSERT/UPDATE trigger on general_applications; NOT
--                                             RPC-callable -> no EXECUTE grant matters to firing (batch-1
--                                             class, missed there). Caller-safe.
--
-- Safe for expand/contract (ADR-0026): no live caller loses access (authenticated/service_role keep their
-- own direct grants; cron runs as owner; the trigger fires regardless of grants; no anon path). Reversible
-- by re-GRANT; idempotent (re-revoke is a no-op; the REVOKE itself errors on signature drift, aborting the
-- apply, so a drifted signature cannot pass silently; self-checks are read-only).

REVOKE EXECUTE ON FUNCTION public.get_stuck_pending_email_count(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_events_staleness_check() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fill_content_gaps_check_and_inc(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.class_item_release(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_class_curriculum_for_learner(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_general_app_submitted() FROM anon, PUBLIC;

-- ── Self-check #1: each real caller role MUST retain EXECUTE (the , PUBLIC side-effect guard). ──
DO $$
DECLARE
  rec record;
  broken text := '';
  fn_oid oid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('public.get_stuck_pending_email_count(integer)',   'authenticated'),
      ('public.get_stuck_pending_email_count(integer)',   'service_role'),
      ('public.fill_content_gaps_check_and_inc(integer)', 'service_role'),
      ('public.class_item_release(uuid, uuid)',           'authenticated'),
      ('public.class_item_release(uuid, uuid)',           'service_role'),
      ('public.get_class_curriculum_for_learner(uuid)',   'authenticated'),
      ('public.get_class_curriculum_for_learner(uuid)',   'service_role')
    ) AS t(sig, role_name)
  LOOP
    fn_oid := to_regprocedure(rec.sig);
    IF fn_oid IS NULL THEN
      RAISE EXCEPTION 'batch-6 self-check #1: function % did not resolve (signature drift) — aborting', rec.sig;
    END IF;
    IF NOT has_function_privilege(rec.role_name, fn_oid, 'EXECUTE') THEN
      broken := broken || rec.sig || ' -> ' || rec.role_name || '; ';
    END IF;
  END LOOP;
  IF broken <> '' THEN
    RAISE EXCEPTION 'batch-6 revoke stripped a legitimate caller role (the , PUBLIC side-effect): % — aborting', broken;
  END IF;
END $$;

-- ── Self-check #2 (load-bearing): NO anon/public RLS policy may reference any of the 6 functions. ──
-- class_item_release is referenced by RLS policies (all TO authenticated); the others are not in any policy.
-- Reads the live catalog at apply, so a hidden/dashboard anon policy referencing one aborts the migration
-- instead of turning an anon query into `permission denied for function`. Matches the standalone identifier
-- on a word boundary (~* '\m<fn>\M') so an unrelated name that merely contains one of these as a substring
-- is not falsely caught.
DO $$
DECLARE
  rec record;
  danger text := '';
BEGIN
  FOR rec IN
    SELECT pol.schemaname, pol.tablename, pol.policyname, h.fn
      FROM (VALUES
        ('get_stuck_pending_email_count'),
        ('community_events_staleness_check'),
        ('fill_content_gaps_check_and_inc'),
        ('class_item_release'),
        ('get_class_curriculum_for_learner'),
        ('trg_general_app_submitted')
      ) AS h(fn)
      JOIN pg_policies pol
        ON pol.roles && ARRAY['anon','public']::name[]
       AND (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~* ('\m' || h.fn || '\M')
  LOOP
    danger := danger || rec.fn || ' <- ' || rec.schemaname || '.' || rec.tablename ||
              ' policy "' || rec.policyname || '"; ';
  END LOOP;
  IF danger <> '' THEN
    RAISE EXCEPTION 'batch-6 abort: an anon/public RLS policy references a function being revoked (anon would lose a required EXECUTE): %', danger;
  END IF;
END $$;

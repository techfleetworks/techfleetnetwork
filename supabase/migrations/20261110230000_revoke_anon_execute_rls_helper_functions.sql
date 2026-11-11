-- RP-I / DB-1 burndown — batch 3: revoke anon EXECUTE on SECURITY DEFINER RLS-helper functions.
--
-- Batches 1 (18 triggers) and 2 (20 rpc mutations) took the list 76 -> 38. This batch handles 8 of the
-- riskiest remaining functions: SECURITY DEFINER authz HELPERS that are referenced INSIDE RLS policies
-- (is_class_owner/is_enrolled_in_class/is_class_learner, can_read/write_class_module_file,
-- handoff_is_active_member) or PERFORMed inside other definer functions (_assert_class_editor,
-- _learner_cohort_start).
--
-- WHY THESE ARE RISKY — and why the revoke is nevertheless safe here:
-- When an RLS policy's USING/WITH CHECK expression calls a function, the *querying role* must hold EXECUTE
-- on that function for the query to run (SECURITY DEFINER changes the context AFTER invocation, not the
-- right to invoke). So if `anon` could query a table whose policy calls one of these helpers, revoking
-- anon's EXECUTE would turn an anon read into `permission denied for function`. That is the failure mode
-- this batch must rule out.
--
-- EVIDENCE (observed, on this branch): every RLS policy that references these 6 policy-helpers is declared
-- `TO authenticated` (class_module_sections/items/attachments/progress/audit in 20260622034033 &
-- 20260808160200; storage.objects cmf_* in 20260808160100; handoff_* in 20260810180000/190000/
-- 20260811120000/20260812*). None is `TO anon`/`TO public`. The 2 remaining (_assert_class_editor,
-- _learner_cohort_start) appear in NO policy at all — only `PERFORM`ed inside other SECURITY DEFINER
-- functions, where the nested call runs as the outer function's definer (the table owner), never as the
-- invoking role. All 8 already carry `REVOKE ALL ... FROM PUBLIC` + (6 of them) `GRANT ... TO
-- authenticated, service_role` in their own definitions: the authors already intended only
-- authenticated/service_role, and the anon exposure is the residual *direct* default-privilege grant that
-- `REVOKE ... FROM PUBLIC` does not remove (the batch-1 mechanism). `REVOKE ... FROM anon, PUBLIC` aligns
-- the grant with the authors' explicit intent.
--
-- TWO FAIL-CLOSED SELF-CHECKS (closing the CI-vs-prod gap — both run at prod `db push`, against prod's
-- live catalog, not just CI):
--   #1 caller preservation — the 6 policy-helpers are evaluated as `authenticated` in their TO-authenticated
--      policies, so `authenticated` MUST retain EXECUTE; assert it, abort otherwise. (The 2 nested-only
--      helpers run as the owner/definer, which always retains EXECUTE, so no role assertion is needed for
--      them.)
--   #2 anon-RLS safety — assert NO policy that applies to `anon` or `public` references any of the 8
--      helpers. This is the load-bearing guard: it reads prod's real pg_policies at apply time, so a
--      hidden/dashboard-defined anon policy referencing a helper ABORTS the migration instead of silently
--      breaking an anon read. (It over-matches on the bare name — the safe direction: a false match only
--      causes a spurious abort, never a silent break.)
--
-- has_role(uuid, app_role) is deliberately NOT in this batch: it is referenced by far more policies
-- (hundreds), is the highest-blast-radius helper, and needs its own dedicated anon-policy audit. Kept.
--
-- Safe for expand/contract (ADR-0026): no live caller loses access (authenticated/service_role keep their
-- direct grants; definer context unaffected; no anon path, proven by #2). Reversible by re-GRANT.
-- Idempotent: revoking an absent grant is a no-op; both self-checks are read-only.

REVOKE EXECUTE ON FUNCTION public.is_class_owner(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_class_learner(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_class_module_file(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_write_class_module_file(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handoff_is_active_member(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._assert_class_editor(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._learner_cohort_start(uuid, uuid) FROM anon, PUBLIC;

-- ── Self-check #1: the 6 policy-helpers are evaluated as `authenticated`; it MUST retain EXECUTE. ──
DO $$
DECLARE
  rec record;
  broken text := '';
  fn_oid oid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('public.is_class_owner(uuid, uuid)'),
      ('public.is_enrolled_in_class(uuid, uuid)'),
      ('public.is_class_learner(uuid, uuid)'),
      ('public.can_read_class_module_file(text)'),
      ('public.can_write_class_module_file(text)'),
      ('public.handoff_is_active_member(uuid)')
    ) AS t(sig)
  LOOP
    fn_oid := to_regprocedure(rec.sig);
    IF fn_oid IS NULL THEN
      RAISE EXCEPTION 'batch-3 self-check #1: function % did not resolve (signature drift) — aborting', rec.sig;
    END IF;
    IF NOT has_function_privilege('authenticated', fn_oid, 'EXECUTE') THEN
      broken := broken || rec.sig || '; ';
    END IF;
  END LOOP;
  IF broken <> '' THEN
    RAISE EXCEPTION 'batch-3 revoke stripped authenticated EXECUTE (the , PUBLIC side-effect) on: % — aborting', broken;
  END IF;
END $$;

-- ── Self-check #2 (load-bearing): no anon/public RLS policy may reference any of the 8 revoked helpers. ──
-- Runs against the LIVE catalog at apply time (CI and prod), so a hidden anon policy aborts the migration.
DO $$
DECLARE
  rec record;
  danger text := '';
BEGIN
  FOR rec IN
    SELECT h.fn, pol.schemaname, pol.tablename, pol.policyname
      FROM (VALUES
        ('is_class_owner'),('is_enrolled_in_class'),('is_class_learner'),
        ('can_read_class_module_file'),('can_write_class_module_file'),
        ('handoff_is_active_member'),('_assert_class_editor'),('_learner_cohort_start')
      ) AS h(fn)
      JOIN pg_policies pol
        ON pol.roles && ARRAY['anon','public']::name[]
       AND (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ILIKE '%' || h.fn || '%'
  LOOP
    danger := danger || rec.fn || ' <- ' || rec.schemaname || '.' || rec.tablename ||
              ' policy "' || rec.policyname || '"; ';
  END LOOP;
  IF danger <> '' THEN
    RAISE EXCEPTION 'batch-3 abort: an anon/public RLS policy references a helper being revoked (anon would lose a required EXECUTE): %', danger;
  END IF;
END $$;

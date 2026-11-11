-- RP-I / DB-1 burndown — batch 5: revoke anon EXECUTE on has_role(uuid, app_role).
--
-- has_role is the SECURITY DEFINER admin authz helper and the single highest-blast-radius item in the
-- DB-1 inventory. Batches 1-3 took the list 76 -> 30 and deliberately deferred has_role; batch 4
-- (20261111000000) tightened the 9 implicit-PUBLIC RLS policies that referenced has_role to
-- `TO authenticated`, which is the PREREQUISITE for this revoke. This migration must apply AFTER batch 4.
--
-- WHY SAFE NOW. An RLS policy expression is evaluated as the *querying* role, so anon needs EXECUTE on
-- has_role only if an anon-applicable policy (directly or transitively) references it. After batch 4, no
-- anon/public policy references has_role. has_role also carries its own DIRECT grants to `authenticated`
-- (20260430021322:7) and `service_role` (20260708050000), so `REVOKE ... FROM anon, PUBLIC` removes only
-- anon's residual default-privilege direct grant and leaves both legitimate callers untouched (the
-- batch-1 direct-grant mechanism). Single overload (confirmed): public.has_role(uuid, app_role).
--
-- Safe for expand/contract (ADR-0026): no live caller loses access (authenticated/service_role keep direct
-- grants; definer context unaffected; no anon path, proven by self-checks #2/#3). Reversible by re-GRANT;
-- idempotent (re-revoke no-op; self-checks read-only).

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;

-- ── Self-check #1: authenticated AND service_role MUST retain EXECUTE (the , PUBLIC side-effect guard). ──
DO $$
DECLARE
  fn_oid oid := to_regprocedure('public.has_role(uuid, app_role)');
  broken text := '';
BEGIN
  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'batch-5 self-check #1: public.has_role(uuid, app_role) did not resolve (signature drift) — aborting';
  END IF;
  IF NOT has_function_privilege('authenticated', fn_oid, 'EXECUTE') THEN broken := broken || 'authenticated; '; END IF;
  IF NOT has_function_privilege('service_role',  fn_oid, 'EXECUTE') THEN broken := broken || 'service_role; '; END IF;
  IF broken <> '' THEN
    RAISE EXCEPTION 'batch-5 revoke stripped a legitimate caller role (the , PUBLIC side-effect) on has_role: % — aborting', broken;
  END IF;
END $$;

-- ── Self-check #2 (load-bearing, direct): NO anon/public RLS policy may reference has_role in its text. ──
-- Reads the live catalog at apply; confirms batch 4 applied and no new anon/public has_role policy exists.
DO $$
DECLARE danger text;
BEGIN
  SELECT string_agg(schemaname || '.' || tablename || ' "' || policyname || '" [' ||
                    array_to_string(roles, ',') || ']', '; ')
    INTO danger
    FROM pg_policies
   WHERE roles && ARRAY['anon','public']::name[]
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%has_role%';
  IF danger IS NOT NULL AND danger <> '' THEN
    RAISE EXCEPTION 'batch-5 abort: an anon/public RLS policy references has_role directly (revoking anon EXECUTE breaks it) — run batch 4 first: %', danger;
  END IF;
END $$;

-- ── Self-check #3 (load-bearing, transitive): NO anon-reachable SECURITY INVOKER function or ──
-- security_invoker view may call has_role. Such code runs has_role as the INVOKING role (anon), so it
-- would need anon EXECUTE even though the has_role token is not in any policy's own text. A plain view
-- (no security_invoker option) and a SECURITY DEFINER function run as the owner, which always retains
-- EXECUTE, so they are correctly excluded. Over-matches on the bare name (safe direction: a spurious
-- abort, never a silent break).
DO $$
DECLARE danger text := '';
  rec record;
BEGIN
  -- (a) SECURITY INVOKER functions that anon can EXECUTE and whose body references has_role.
  -- prokind IN ('f','p') excludes aggregates/windows (pg_get_functiondef errors on those); the body is
  -- scanned via BOTH prosrc (dollar-quoted bodies) AND pg_get_functiondef (SQL-standard BEGIN ATOMIC
  -- bodies, where prosrc is empty), so a BEGIN ATOMIC invoker function cannot evade the check.
  FOR rec IN
    SELECT n.nspname || '.' || p.proname AS obj
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE NOT p.prosecdef
       AND p.prokind IN ('f', 'p')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND (coalesce(p.prosrc, '') ILIKE '%has_role%'
            OR pg_get_functiondef(p.oid) ILIKE '%has_role%')
  LOOP
    danger := danger || 'invoker-fn ' || rec.obj || '; ';
  END LOOP;
  -- (b) security_invoker views that anon can SELECT and whose definition references has_role.
  FOR rec IN
    SELECT c.relnamespace::regnamespace || '.' || c.relname AS obj
      FROM pg_class c
     WHERE c.relkind = 'v'
       AND c.reloptions IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM unnest(c.reloptions) o
          WHERE o ILIKE 'security_invoker=true' OR o ILIKE 'security_invoker=on'
       )
       AND has_table_privilege('anon', c.oid, 'SELECT')
       AND pg_get_viewdef(c.oid) ILIKE '%has_role%'
  LOOP
    danger := danger || 'invoker-view ' || rec.obj || '; ';
  END LOOP;
  IF danger <> '' THEN
    RAISE EXCEPTION 'batch-5 abort: an anon-reachable SECURITY INVOKER function/view calls has_role (anon would lose a required EXECUTE): %', danger;
  END IF;
END $$;

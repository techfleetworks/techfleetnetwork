-- RP-I / DB-1 burndown — batch 4: tighten 9 implicit-PUBLIC has_role RLS policies to `TO authenticated`.
--
-- WHY THIS, NOT A REVOKE. Batch 4 was planned as "revoke anon EXECUTE on has_role(uuid, app_role)".
-- A dedicated anon-policy audit (all 367 policy-touching migrations, cross-checked) found that has_role
-- CANNOT yet be revoked: 9 LIVE RLS policies call has_role in USING/WITH CHECK *and* have NO `TO` clause,
-- which in Postgres defaults the policy to the PUBLIC role group — i.e. `anon` is in scope. Because an RLS
-- expression is evaluated as the *querying* role (SECURITY DEFINER changes context only AFTER the call,
-- not the right to invoke), revoking anon's EXECUTE on has_role would turn an anon query against any of
-- these tables into `permission denied for function has_role`. That is exactly the break batch 3's
-- self-check #2 is designed to catch; these 9 policies would trip it. So the real prerequisite — this
-- batch — is to remove anon from the scope of these 9 policies. Revoking anon on has_role itself is a
-- LATER batch, after this is applied and verified (expand/contract: tighten the policies first).
--
-- THE 9 POLICIES (each: no `TO` clause → PUBLIC → includes anon; each calls public.has_role):
--   policy_versions        "policy_versions admin write"            FOR ALL     (20260508041349:24)
--   policy_acknowledgments "ack self read"                         FOR SELECT  (20260508041349:41)
--   recording_consents     "rec self read"                         FOR SELECT  (20260508041349:56)
--   sanctions_screenings   "sanctions admin read"                  FOR SELECT  (20260508041349:75)
--   dispute_intake         "dispute admin read"                    FOR SELECT  (20260508041349:93)
--   dispute_intake         "dispute admin update"                  FOR UPDATE  (20260508041349:95)
--   dpa_executions         "dpa admin all"                         FOR ALL     (20260508041349:112)
--   observer_role_optins   "Admins can view all observer opt-ins"  FOR SELECT  (20260505165328:19)
--   lesson_video_events    "lve self or admin read"                FOR SELECT  (20260522154858:26)
--
-- WHY THIS IS BEHAVIOR-PRESERVING (and therefore expand/contract-safe, ADR-0026):
-- These are admin-only or self-or-admin checks. For an anon caller, auth.uid() is NULL, so the row test
-- `user_id = auth.uid()` is NULL/false and `has_role(NULL, 'admin')` is false — anon already matches NO
-- rows through any of these 9 permissive policies today. Moving them to `TO authenticated` removes anon
-- from scope entirely: anon then has no applicable policy for that command → default-deny → still no rows.
-- Same observable result for anon, minus the has_role evaluation. `authenticated` keeps the identical
-- policy (its direct grant on has_role is untouched), so admins/self see exactly what they see now.
--   - policy_versions is the one table anon legitimately reads: its SEPARATE "policy_versions readable by
--     all" (FOR SELECT USING(true), PUBLIC) policy is NOT touched, so anon still reads policy versions;
--     after this change an anon SELECT no longer also evaluates the admin-write policy's has_role.
-- No app/edge code path relies on anon-scope of these 9 (anon writes go through SECURITY DEFINER RPCs
-- record_policy_ack / record_sanctions_screening / submit_dispute, not direct table access). So the
-- migration is safe to apply before/after any frontend or edge deploy, and safe to leave if code rolls
-- back (ADR-0036: db push is not atomic with a code deploy).
--
-- MECHANISM. `ALTER POLICY ... TO authenticated` changes only the applicable roles; the USING / WITH
-- CHECK expressions are preserved verbatim (smaller and safer than DROP + re-CREATE). Guarded by an
-- existence check so re-running is a no-op (idempotent); reversible-forward by a later `ALTER POLICY ...
-- TO public`. No grant is changed here.

-- ── Apply: ALTER each of the 9 to `TO authenticated` (guarded + idempotent); abort on name drift. ──
DO $$
DECLARE
  rec record;
  missing text := '';
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('policy_versions',        'policy_versions admin write'),
      ('policy_acknowledgments', 'ack self read'),
      ('recording_consents',     'rec self read'),
      ('sanctions_screenings',   'sanctions admin read'),
      ('dispute_intake',         'dispute admin read'),
      ('dispute_intake',         'dispute admin update'),
      ('dpa_executions',         'dpa admin all'),
      ('observer_role_optins',   'Admins can view all observer opt-ins'),
      ('lesson_video_events',    'lve self or admin read')
    ) AS t(tbl, pol)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = rec.tbl AND policyname = rec.pol
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', rec.pol, rec.tbl);
    ELSE
      missing := missing || 'public.' || rec.tbl || ' "' || rec.pol || '"; ';
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'batch-4 abort: an expected has_role policy was not found (name/signature drift) — %', missing;
  END IF;
END $$;

-- ── Self-check #1: none of the 9 targeted policies still applies to anon/public after the ALTER. ──
DO $$
DECLARE still_public text;
BEGIN
  SELECT string_agg(tablename || ' "' || policyname || '" [' || array_to_string(roles, ',') || ']', '; ')
    INTO still_public
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (tablename, policyname) IN (
       ('policy_versions',        'policy_versions admin write'),
       ('policy_acknowledgments', 'ack self read'),
       ('recording_consents',     'rec self read'),
       ('sanctions_screenings',   'sanctions admin read'),
       ('dispute_intake',         'dispute admin read'),
       ('dispute_intake',         'dispute admin update'),
       ('dpa_executions',         'dpa admin all'),
       ('observer_role_optins',   'Admins can view all observer opt-ins'),
       ('lesson_video_events',    'lve self or admin read')
     )
     AND roles && ARRAY['anon','public']::name[];
  IF still_public IS NOT NULL AND still_public <> '' THEN
    RAISE EXCEPTION 'batch-4 abort: a targeted policy still applies to anon/public after ALTER: %', still_public;
  END IF;
END $$;

-- ── Self-check #2 (load-bearing): NO anon/public RLS policy anywhere may reference has_role. ──
-- Reads the live catalog at apply time (CI and prod), so a hidden/dashboard-defined anon policy that
-- references has_role aborts the migration instead of leaving the has_role anon-revoke (batch 5) unsafe.
-- After this migration succeeds, this invariant holds: has_role is then safe to revoke from anon.
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
    RAISE EXCEPTION 'batch-4 abort: an anon/public RLS policy still references has_role (revoking anon EXECUTE on has_role would break it): %', danger;
  END IF;
END $$;

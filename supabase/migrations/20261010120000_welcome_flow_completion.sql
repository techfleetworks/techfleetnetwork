-- Welcome Flow — completion fact + its owned read/write RPCs (EXPAND, additive only).
-- ADR 20261009-welcome-flow-data-model (one new column) + ADR 20261009-welcome-flow-gate
-- (mandatory, flagless gate reads this fact) + ADR-0050 (the Courses completion stat is
-- live-derived, never a stored counter).
--
-- Expand/contract safety (supabase/migrations/CLAUDE.md, ADR-0026): the column is nullable
-- forever (NULL = "show the flow once"), so this is safe to apply BEFORE any code reads it and
-- safe to leave applied if that code later rolls back. No backfill-as-complete — backfilling
-- would suppress the flow for the exact cohort it targets. profiles is ROW-scoped RLS
-- (auth.uid() = user_id), NOT column-scoped like projects (ADR-0056), so NO per-column GRANT is
-- needed — a member already selects their own row's columns, and the write goes through the
-- SECURITY DEFINER RPC below, never a direct client UPDATE. Idempotent (IF NOT EXISTS /
-- CREATE OR REPLACE) so migration-smoke can re-apply from scratch.

-- ── 1. The one new column ────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_flow_completed_at timestamptz;   -- NULL = gate the flow once

COMMENT ON COLUMN public.profiles.welcome_flow_completed_at IS
  'Set ONCE by mark_welcome_flow_complete() when the member finishes the mandatory Welcome Flow. '
  'NULL = the route gate still shows the flow. Distinct from onboarded_at (legacy skippable wizard + '
  'v_profile_readiness). Cross-device "never again" lives here, never in localStorage. '
  'ADR 20261009-welcome-flow-data-model.';

-- ── 2. Completion write — set-once, self-scoped, un-forgeable ─────────────────────
-- No arguments: pins to auth.uid(), so a caller can never complete the flow for another user
-- (there is no client-supplied user_id to tamper with; row-scoped RLS is the backstop). Set-once
-- via COALESCE — a retry / double-click / voluntary Courses replay re-reads the existing non-null
-- value and leaves the original timestamp untouched (idempotent). Returns the effective timestamp.
CREATE OR REPLACE FUNCTION public.mark_welcome_flow_complete()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ts  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  UPDATE public.profiles
     SET welcome_flow_completed_at = COALESCE(welcome_flow_completed_at, now())
   WHERE user_id = v_uid
   RETURNING welcome_flow_completed_at INTO v_ts;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile for user' USING errcode = 'P0002';
  END IF;

  RETURN v_ts;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_welcome_flow_complete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_welcome_flow_complete() TO authenticated;

-- ── 3. Completion-count read — LIVE-derived, never a stored counter (ADR-0050) ────
-- Counts the source-of-truth rows at read time; there is NO welcome_flow_stats table and no
-- +1 counter to drift (that was the Platform-Signups-stuck-at-768 class of bug, ADR-0050).
-- SECURITY DEFINER so it can count across rows that row-scoped RLS would otherwise hide, while
-- exposing ONLY a single scalar (no row data leaks). Excludes test accounts, mirroring
-- get_network_stats. STABLE + PARALLEL SAFE (pure read). The Courses stat (requirements §4.11 /
-- §6.13) reads this via one cached query.
CREATE OR REPLACE FUNCTION public.get_welcome_flow_completion_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT count(*)::int
  FROM public.profiles
  WHERE welcome_flow_completed_at IS NOT NULL
    AND NOT COALESCE(is_test_account, false);
$$;

REVOKE ALL ON FUNCTION public.get_welcome_flow_completion_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_welcome_flow_completion_count() TO authenticated, service_role;

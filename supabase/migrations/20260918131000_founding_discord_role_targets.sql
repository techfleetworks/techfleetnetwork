-- Founding Members Discord role — invariant target set + DRY-RUN gap report (ADR-0049, PR-A).
--
-- Defines the ONE owner of "who should hold the Founding Members Discord role":
--     target  ⇔  is_founding_member = true  AND  Discord is connected (OAuth-verified).
-- (`discord_user_id` is written ONLY by the discord-oauth-callback after /users/@me ownership
--  proof, so "connected" already means "proven owner".)
--
-- PR-A ships ONLY the read side + a dry-run count. It writes NOTHING to
-- discord_role_grant_queue and calls no Discord API, so it is safe to leave live while the
-- actual grant worker is still dark. Its purpose is release-deployment-safety: verify the real
-- founding-member population (how many would be granted, how many bought-but-not-connected)
-- BEFORE any grant path goes live. Expand-only + idempotent (CREATE OR REPLACE).

-- ── The invariant target set (single owner of "who should have the founding role") ──
CREATE OR REPLACE FUNCTION public.list_founding_discord_role_targets()
RETURNS TABLE (user_id uuid, discord_user_id text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p.user_id, p.discord_user_id
    FROM public.profiles p
   WHERE p.is_founding_member = true
     AND p.discord_user_id IS NOT NULL
     AND COALESCE(p.has_discord_account, false) = true;
$$;

COMMENT ON FUNCTION public.list_founding_discord_role_targets() IS
  'ADR-0049: users who SHOULD hold the Founding Members Discord role (founding latch AND OAuth-verified Discord link). Returns discord_user_id (CONFIDENTIAL PII) — service-role only.';

-- Raw list exposes CONFIDENTIAL discord_user_id → service-role only (admins get counts via the
-- report below). No grant to authenticated/anon.
REVOKE ALL ON FUNCTION public.list_founding_discord_role_targets() FROM public;
GRANT EXECUTE ON FUNCTION public.list_founding_discord_role_targets() TO service_role;

-- ── Dry-run gap report: counts only, one audit summary row, ZERO side effects on Discord ──
CREATE OR REPLACE FUNCTION public.report_founding_discord_role_gap()
RETURNS TABLE (
  founding_total       integer,
  connected_targets    integer,
  founding_no_discord  integer,
  already_granted      integer,
  role_id              text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role_id text;
  v_founding_total integer;
  v_targets integer;
  v_no_discord integer;
  v_granted integer;
BEGIN
  SELECT dr.role_id INTO v_role_id
    FROM public.discord_roles dr
   WHERE dr.key = 'founding_members';

  SELECT count(*) INTO v_founding_total
    FROM public.profiles p
   WHERE p.is_founding_member = true;

  SELECT count(*) INTO v_targets
    FROM public.list_founding_discord_role_targets();

  SELECT count(*) INTO v_no_discord
    FROM public.profiles p
   WHERE p.is_founding_member = true
     AND (p.discord_user_id IS NULL OR COALESCE(p.has_discord_account, false) = false);

  -- Rows already reflected as granted in the shared retry queue for this role (read-only).
  SELECT count(*) INTO v_granted
    FROM public.discord_role_grant_queue q
   WHERE q.role_id = v_role_id
     AND q.granted_at IS NOT NULL;

  -- One audit summary so the dry-run number is visible in the Activity Log before go-live.
  PERFORM public.write_audit_log(
    p_event_type    := 'founding_discord_role_reconcile_dryrun',
    p_table_name    := 'discord_roles',
    p_record_id     := 'founding_members',
    p_user_id       := NULL,
    p_error_message := NULL,
    p_changed_fields := ARRAY[
      'mode:dry_run',
      'founding_total:'    || v_founding_total,
      'connected_targets:' || v_targets,
      'founding_no_discord:' || v_no_discord,
      'already_granted:'   || v_granted,
      'role_id:'           || COALESCE(v_role_id, 'MISSING')
    ]
  );

  RETURN QUERY SELECT v_founding_total, v_targets, v_no_discord, v_granted, v_role_id;
END;
$$;

COMMENT ON FUNCTION public.report_founding_discord_role_gap() IS
  'ADR-0049 PR-A dry-run: counts founding members, connected targets, and bought-but-not-connected, writes one audit summary, and performs NO grants/enqueues/Discord calls.';

REVOKE ALL ON FUNCTION public.report_founding_discord_role_gap() FROM public;
GRANT EXECUTE ON FUNCTION public.report_founding_discord_role_gap() TO service_role;

-- ADR-0052 — retire the stats-snapshot subsystem (CONTRACT half of ADR-0050 / PR #361).
--
-- ADR-0050 made every displayed community stat a LIVE count of its owning rows:
-- get_network_stats() and get_course_completion_counts(jsonb) no longer read the stored
-- counter tables course_completion_stats / network_stats_snapshots. Those tables, and the
-- recompute/reconcile machinery that only fed them, are now vestigial. This migration removes
-- them WITHOUT regressing badge emission or the append-only course_completions ledger.
--
-- THE BADGE LANDMINE this migration defuses:
--   get_network_stats.badges_earned is a live count(*) of badges_awarded. Three badge kinds feed
--   it. Two are already emitted by live triggers that we KEEP:
--     - course_completed:* — fn_evaluate_course_completion (wired via journey_progress triggers)
--     - application_submitted — trg_general_app_submitted / fn_emit_application_badge
--   The THIRD, discord_linked, was emitted ONLY by recompute_all_stats()'s backfill INSERT — there
--   is NO live trigger for it (set_discord_linked_at only stamps the timestamp). So retiring
--   recompute would silently stop discord_linked badges and undercount badges_earned. Step 1 adds
--   a live trigger to replace recompute's one unique duty, and backfills any currently-linked
--   profile that is missing the badge (idempotent — same (user_id, 'discord_linked', user_id::text)
--   identity recompute used, so it dedups against existing rows).
--
-- Idempotent / guarded throughout (CREATE OR REPLACE, IF EXISTS, ON CONFLICT DO NOTHING). This is a
-- CONTRACT migration (ADR-0026): the EXPAND (live RPCs) already merged and is verified applied.
-- The db-schema-gate (ADR-0036) will report the new trigger + its function as "declared but absent
-- from prod" until this is hand-applied via `supabase db push` — that red is expected and clears on
-- apply. network_stats_overrides / network_stats_historical are UNTOUCHED (owner: frozen figures).

-- ── 1. Live discord_linked badge trigger (replaces recompute's only unique duty) ───────────────
CREATE OR REPLACE FUNCTION public.fn_emit_discord_linked_badge()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Fire when discord_user_id BECOMES non-null/non-empty (on INSERT, or when it changes). The
  -- BEFORE trigger set_discord_linked_at has already stamped discord_linked_at by the time this
  -- AFTER trigger runs, so COALESCE(NEW.discord_linked_at, now()) is the link time. fn_emit_badge
  -- is ON CONFLICT DO NOTHING, so re-firing is harmless.
  IF (NEW.discord_user_id IS NOT NULL AND NEW.discord_user_id <> '')
     AND (TG_OP = 'INSERT' OR OLD.discord_user_id IS DISTINCT FROM NEW.discord_user_id)
  THEN
    PERFORM public.fn_emit_badge(
      NEW.user_id, 'discord_linked', 'profile', NEW.user_id::text,
      COALESCE(NEW.discord_linked_at, now()));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_emit_discord_linked_badge ON public.profiles;
CREATE TRIGGER trg_emit_discord_linked_badge
  AFTER INSERT OR UPDATE OF discord_user_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_emit_discord_linked_badge();

-- Backfill: currently-linked profiles that are missing the badge (same identity + awarded_at as
-- recompute's INSERT, so this is a no-op where the badge already exists).
INSERT INTO public.badges_awarded (user_id, badge_code, source, source_id, awarded_at)
SELECT p.user_id, 'discord_linked', 'profile', p.user_id::text,
       COALESCE(p.discord_linked_at, p.created_at, now())
FROM public.profiles p
WHERE p.discord_user_id IS NOT NULL AND p.discord_user_id <> ''
ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;

-- ── 2. Course-completion trigger fn: drop ONLY the stored-counter writes ───────────────────────
-- Keeps the course_completions ledger INSERT and the fn_emit_badge call; removes the
-- network_stats_snapshots + course_completion_stats increment blocks (the tables are dropped
-- below, so leaving those INSERTs would make a course completion RAISE at runtime).
CREATE OR REPLACE FUNCTION public.fn_evaluate_course_completion(_user_id uuid, _lesson_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_course_key text; v_required int; v_done int;
  v_completion_id uuid;
BEGIN
  SELECT course_key INTO v_course_key
  FROM public.lesson_catalog
  WHERE lesson_id = _lesson_id AND active AND required
  LIMIT 1;
  IF v_course_key IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_required FROM public.lesson_catalog
  WHERE course_key = v_course_key AND active AND required;

  SELECT count(DISTINCT jp.task_id) INTO v_done
  FROM public.journey_progress jp
  JOIN public.lesson_catalog lc ON lc.lesson_id = jp.task_id
  WHERE jp.user_id = _user_id AND jp.completed = true
    AND lc.course_key = v_course_key AND lc.active AND lc.required;

  IF v_done < v_required THEN RETURN; END IF;

  INSERT INTO public.course_completions (user_id, course_key, completed_at)
  VALUES (_user_id, v_course_key, now())
  ON CONFLICT (user_id, course_key) DO NOTHING
  RETURNING id INTO v_completion_id;

  IF v_completion_id IS NULL THEN RETURN; END IF;

  PERFORM public.fn_emit_badge(_user_id, 'course_completed:' || v_course_key,
    'course_completion', v_completion_id::text, now());
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_course_completion(uuid,text) FROM PUBLIC, anon, authenticated;

-- ── 3. General-application trigger fn: drop ONLY the stored-counter writes ──────────────────────
-- Keeps the submission INSERT and the application_submitted badge; removes the
-- network_stats_snapshots increment block.
CREATE OR REPLACE FUNCTION public.trg_general_app_submitted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sub_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.general_application_submissions (user_id, submitted_at, application_id)
    VALUES (NEW.user_id, COALESCE(NEW.completed_at, now()), NEW.id)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_sub_id;
    IF v_sub_id IS NOT NULL THEN
      PERFORM public.fn_emit_badge(NEW.user_id, 'application_submitted',
        'general_application', v_sub_id::text, COALESCE(NEW.completed_at, now()));
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── 4. admin_set_test_account: drop the recompute call ─────────────────────────────────────────
-- Flipping is_test_account is now reflected LIVE by get_network_stats (it filters test accounts on
-- every read), so the trailing PERFORM recompute_all_stats() is obsolete. Same (uuid, boolean)
-- identity + boolean return + audit_log write as the live definition — only the recompute call is
-- gone. (recompute_all_stats is dropped below.)
CREATE OR REPLACE FUNCTION public.admin_set_test_account(_user_id uuid, _is_test boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_test_account = _is_test WHERE user_id = _user_id;
  BEGIN
    INSERT INTO public.audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'profile.is_test_account.set', 'profile', _user_id::text,
            jsonb_build_object('is_test_account', _is_test));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) TO authenticated;

-- ── 5. Unschedule the recompute cron (guarded — pg_cron may be absent locally) ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-network-stats-every-15m') THEN
      PERFORM cron.unschedule('recompute-network-stats-every-15m');
    END IF;
  END IF;
END $$;

-- ── 6. Drop the recompute / reconcile machinery (only ever served the stored counters) ─────────
-- reconcile_course_badge_parity() reads both counter tables and calls recompute_all_stats(); its
-- only caller admin_reconcile_parity() is dropped too. recompute_all_stats_lock_key() only namespaced
-- recompute's advisory lock. None have any remaining caller once the above land.
DROP FUNCTION IF EXISTS public.reconcile_course_badge_parity();
DROP FUNCTION IF EXISTS public.admin_reconcile_parity();
DROP FUNCTION IF EXISTS public.admin_recompute_stats();
DROP FUNCTION IF EXISTS public.recompute_all_stats();
DROP FUNCTION IF EXISTS public.recompute_all_stats_lock_key();

-- ── 7. Drop the stored counter tables (their RLS policies drop with them) ──────────────────────
-- Verified: no FK points at these, no view reads them, and every function that referenced them is
-- either replaced above (steps 2-3) or dropped (step 6). No CASCADE needed.
-- NOT dropped: stats_drift_log (its columns are still tracked by the ADR-0036 drift allowlist,
-- DRIFT-B — see ADR-0052), network_stats_overrides, network_stats_historical (owner: frozen).
DROP TABLE IF EXISTS public.course_completion_stats;
DROP TABLE IF EXISTS public.network_stats_snapshots;

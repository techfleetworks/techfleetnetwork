-- ADR-0045 — live-derived stats (EXPAND). get_network_stats() computes platform-owned
-- facts (signups, course completions by tier, discord links, applications, badges, and
-- their past-7d slices) as LIVE counts of the owning rows instead of reading the
-- cron-refreshed `network_stats_snapshots`. Output shape/keys are unchanged, so it is safe
-- to apply before/after the frontend deploys. Overrides, projects, and the STATIC historical
-- Airtable figures are read exactly as before (owner decision: historicals stay frozen).
-- Idempotent (CREATE OR REPLACE). Snapshot rows/recompute are left in place; retiring them
-- is a LATER contract migration once this is verified applied.

CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
WITH
pw AS (SELECT (current_date - interval '7 days')::date AS wk_start, current_date AS wk_end),
o AS (SELECT metric_key, value FROM public.network_stats_overrides),
h AS (SELECT metric_key, value, last_synced_at FROM public.network_stats_historical),
prof AS (
  SELECT
    count(*) FILTER (WHERE NOT COALESCE(is_test_account,false)) AS signups,
    count(*) FILTER (WHERE NOT COALESCE(is_test_account,false)
                     AND created_at::date >= (SELECT wk_start FROM pw)
                     AND created_at::date <  (SELECT wk_end   FROM pw)) AS signups_7d,
    count(*) FILTER (WHERE NOT COALESCE(is_test_account,false)
                     AND discord_user_id IS NOT NULL AND discord_user_id <> ''
                     AND discord_linked_at IS NOT NULL) AS discord_links,
    count(*) FILTER (WHERE NOT COALESCE(is_test_account,false)
                     AND discord_user_id IS NOT NULL AND discord_user_id <> ''
                     AND discord_linked_at::date >= (SELECT wk_start FROM pw)
                     AND discord_linked_at::date <  (SELECT wk_end   FROM pw)) AS discord_links_7d
  FROM public.profiles
),
comp AS (
  -- Course completion is derived LIVE from journey_progress against the required lessons in
  -- lesson_catalog (the server-side owner of "which tasks make a course") — NOT from the
  -- append-only course_completions ledger. So a member who un-completes a required task drops
  -- out here too, exactly as they do on the course card (ADR-0045). lesson_catalog is the
  -- server-side definition; keeping it in lockstep with the app's *_TASK_IDS is the tracked
  -- follow-up (PRD §9).
  SELECT
    count(*)                                        AS all_total,
    count(*) FILTER (WHERE cat.tier='core')         AS core_total,
    count(*) FILTER (WHERE cat.tier='onboarding')   AS onb_total,
    count(DISTINCT puc.user_id)                     AS distinct_people,
    count(*) FILTER (WHERE puc.completed_on >= (SELECT wk_start FROM pw)
                       AND puc.completed_on <  (SELECT wk_end   FROM pw))               AS all_7d,
    count(*) FILTER (WHERE cat.tier='core'
                       AND puc.completed_on >= (SELECT wk_start FROM pw)
                       AND puc.completed_on <  (SELECT wk_end   FROM pw))               AS core_7d,
    count(*) FILTER (WHERE cat.tier='onboarding'
                       AND puc.completed_on >= (SELECT wk_start FROM pw)
                       AND puc.completed_on <  (SELECT wk_end   FROM pw))               AS onb_7d
  FROM (
    SELECT jp.user_id, lc.course_key,
           count(DISTINCT jp.task_id)  AS done,
           max(jp.completed_at)::date  AS completed_on
    FROM public.journey_progress jp
    JOIN public.lesson_catalog lc ON lc.lesson_id = jp.task_id AND lc.active AND lc.required
    JOIN public.profiles p        ON p.user_id = jp.user_id
    WHERE jp.completed AND NOT COALESCE(p.is_test_account, false)
    GROUP BY jp.user_id, lc.course_key
  ) puc
  JOIN public.course_catalog cat ON cat.course_key = puc.course_key
  JOIN (
    SELECT course_key, count(*) AS req
    FROM public.lesson_catalog WHERE active AND required GROUP BY course_key
  ) reqs ON reqs.course_key = puc.course_key
  WHERE puc.done >= reqs.req
),
apps AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE s.submitted_at::date >= (SELECT wk_start FROM pw)
                       AND s.submitted_at::date <  (SELECT wk_end   FROM pw)) AS total_7d
  FROM public.general_application_submissions s
  JOIN public.profiles p ON p.user_id = s.user_id
  WHERE NOT COALESCE(p.is_test_account,false)
),
badges AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE b.awarded_at::date >= (SELECT wk_start FROM pw)
                       AND b.awarded_at::date <  (SELECT wk_end   FROM pw)) AS total_7d
  FROM public.badges_awarded b
  JOIN public.profiles p ON p.user_id = b.user_id
  WHERE NOT COALESCE(p.is_test_account,false)
    AND b.badge_code NOT LIKE 'phase_completed:%'
),
proj AS (
  SELECT
    count(*) FILTER (WHERE LOWER(project_status::text) = 'apply_now') AS open_apps,
    count(*) FILTER (WHERE LOWER(project_status::text) IN ('coming_soon','recruiting','team_onboarding')) AS coming_soon
  FROM public.projects
)
SELECT jsonb_build_object(
  'total_signups',                 (SELECT signups FROM prof),
  'course_completions_total',      (SELECT all_total FROM comp),
  'core_courses_active',           (SELECT core_total FROM comp),
  'onboarding_courses_active',     (SELECT onb_total FROM comp),
  'discord_links_count',           (SELECT discord_links FROM prof),
  'distinct_course_completers',    (SELECT distinct_people FROM comp),
  'beginner_courses_active',       COALESCE((SELECT value FROM o WHERE metric_key='beginner_courses_active'), 0),
  'advanced_courses_active',       COALESCE((SELECT value FROM o WHERE metric_key='advanced_courses_active'), 0),
  'applications_completed',        (SELECT total FROM apps),
  'badges_earned',                 (SELECT total FROM badges),
  'prev_week_start',               to_char((SELECT wk_start FROM pw), 'YYYY-MM-DD'),
  'prev_week_end',                 to_char((SELECT wk_end FROM pw), 'YYYY-MM-DD'),
  'prev_week_signups',             (SELECT signups_7d FROM prof),
  'prev_week_course_completions_total', (SELECT all_7d FROM comp),
  'prev_week_core_active',         (SELECT core_7d FROM comp),
  'prev_week_onboarding_active',   (SELECT onb_7d FROM comp),
  'prev_week_discord_links_count', (SELECT discord_links_7d FROM prof),
  'prev_week_beginner_active',     COALESCE((SELECT value FROM o WHERE metric_key='prev_week_beginner_active'), 0),
  'prev_week_advanced_active',     COALESCE((SELECT value FROM o WHERE metric_key='prev_week_advanced_active'), 0),
  'prev_week_applications',        (SELECT total_7d FROM apps),
  'prev_week_badges',              (SELECT total_7d FROM badges),
  'projects_open_applications',    (SELECT open_apps FROM proj),
  'projects_coming_soon',          (SELECT coming_soon FROM proj),
  'projects_live',                 COALESCE((SELECT value FROM o WHERE metric_key='projects_live'), 0),
  'projects_previously_completed', COALESCE((SELECT value FROM o WHERE metric_key='projects_previously_completed'), 0),
  'historical', jsonb_build_object(
    'general_applications_pre_platform', COALESCE((SELECT value FROM h WHERE metric_key='general_applications_pre_platform'), 0),
    'service_leadership_unique',         COALESCE((SELECT value FROM h WHERE metric_key='service_leadership_unique'), 0),
    'masterclass_total',                 COALESCE((SELECT value FROM h WHERE metric_key='masterclass_total'), 0),
    'masterclass_minus_servlead',        COALESCE((SELECT value FROM h WHERE metric_key='masterclass_minus_servlead'), 0),
    'historical_beginner_courses',       COALESCE((SELECT value FROM h WHERE metric_key='historical_beginner_courses'), 0),
    'historical_advanced_courses',       COALESCE((SELECT value FROM h WHERE metric_key='historical_advanced_courses'), 0),
    'last_synced_at',                    (SELECT max(last_synced_at) FROM h)
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_network_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_network_stats() TO anon, authenticated, service_role;

-- ============================================================================
-- Stats integrity verification — READ ONLY. No writes, no DDL.
-- Run in the Supabase SQL editor for project pzvqxdgoztbfikfuifix.
-- Compares each DISPLAYED number to the LIVE source-of-truth count, and shows
-- each snapshot's computed_at (proving staleness). Companion to
-- docs/architecture/stats-integrity-prd.md §8. After the fix ships, every
-- `delta` here must be 0 — that is the acceptance test.
-- ============================================================================

-- 1) SIGNUPS + STALENESS: stored snapshot vs live truth, and WHEN it last recomputed.
select 'signups' as section,
  (select value       from public.network_stats_snapshots where scope='all_time' and metric_key='total_signups') as stored_shown,
  (select computed_at from public.network_stats_snapshots where scope='all_time' and metric_key='total_signups') as stored_last_recomputed,
  (select count(*) from auth.users)                                                  as truth_auth_users,
  (select count(*) from public.profiles)                                             as truth_profiles_all,
  (select count(*) from public.profiles where not coalesce(is_test_account,false))   as truth_profiles_non_test;

-- 2) IS THE REFRESH JOB EVEN RUNNING? (proves the freeze). Run the cron.job line only if installed=true.
select exists(select 1 from pg_extension where extname='pg_cron') as pg_cron_installed;
-- select jobname, schedule, active from cron.job;

-- 3) EVERY all-time snapshot with its last-recomputed timestamp (staleness across the board).
select metric_key, value as stored_shown, computed_at as last_recomputed
from public.network_stats_snapshots where scope='all_time' order by metric_key;

-- 4) COURSE-CARD COMPLETERS: stored counter (what the card shows) vs live truth per course.
select course_key, total_completions as stored_shown, computed_at as last_recomputed
from public.course_completion_stats order by course_key;

with per_user as (
  select jp.user_id, lc.course_key, count(distinct jp.task_id) as done
  from public.journey_progress jp
  join public.lesson_catalog lc on lc.lesson_id = jp.task_id and lc.active and lc.required
  where jp.completed
  group by jp.user_id, lc.course_key
), req as (
  select course_key, count(*) as req from public.lesson_catalog where active and required group by course_key
)
select pu.course_key,
  count(*) filter (where pu.done >= r.req and not coalesce(p.is_test_account,false)) as live_completers_non_test
from per_user pu
join req r        on r.course_key = pu.course_key
join public.profiles p on p.user_id = pu.user_id
group by pu.course_key order by pu.course_key;

-- 5) "CORE COURSE COMPLETIONS" card: proves the 860 shows ALL completions, not core.
select 'completions' as section,
  (select value from public.network_stats_snapshots where scope='all_time' and metric_key='all_course_completions_total') as stored_shown_860,
  count(*) filter (where cat.tier='core')                                as truth_core_completions_non_test,
  count(*)                                                               as truth_all_completions_non_test,
  count(distinct cc.user_id)                                            as truth_distinct_people_non_test
from public.course_completions cc
join public.course_catalog cat on cat.course_key = cc.course_key
join public.profiles p         on p.user_id      = cc.user_id
where not coalesce(p.is_test_account,false);

-- 6) BADGES + APPLICATIONS: stored vs live.
select 'badges_apps' as section,
  (select value from public.network_stats_snapshots where scope='all_time' and metric_key='badges_earned_total') as badges_stored_2011,
  (select count(*) from public.badges_awarded b join public.profiles p on p.user_id=b.user_id
     where not coalesce(p.is_test_account,false) and b.badge_code not like 'phase_completed:%')                   as badges_live_non_test,
  (select value from public.network_stats_snapshots where scope='all_time' and metric_key='general_applications_total') as apps_stored,
  (select count(*) from public.general_application_submissions s join public.profiles p on p.user_id=s.user_id
     where not coalesce(p.is_test_account,false))                                                                 as apps_live_non_test;

-- 7) DISCORD (4072 = server headcount, a different population) + static historical (must stay frozen).
select 'discord' as section, guild_id, member_count, updated_at from public.discord_guild_stats;
select count(*) filter (where discord_user_id is not null and discord_user_id<>'')                                    as platform_discord_links_all,
       count(*) filter (where discord_user_id is not null and discord_user_id<>'' and not coalesce(is_test_account,false)) as platform_discord_links_non_test
from public.profiles;
select metric_key, value as static_historical from public.network_stats_historical order by metric_key;

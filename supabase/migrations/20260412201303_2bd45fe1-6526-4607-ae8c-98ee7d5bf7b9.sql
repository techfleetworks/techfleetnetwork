-- Enterprise index optimizations for 10k+ users

-- 1. projects: filter by status is very common (dashboard, openings page, stats function)
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects USING btree (project_status);

-- 2. push_subscriptions: lookups by user_id for push delivery
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

-- 3. general_applications: partial index for submitted apps (used in get_network_stats)
CREATE INDEX IF NOT EXISTS idx_general_applications_submitted ON public.general_applications (completed_at DESC)
  WHERE status = 'submitted';

-- 4. project_applications: user + status composite for filtered lookups
CREATE INDEX IF NOT EXISTS idx_project_applications_user_status ON public.project_applications USING btree (user_id, status);

-- 5. profiles: partial index for project opening notification trigger
CREATE INDEX IF NOT EXISTS idx_profiles_training_opportunities ON public.profiles (user_id)
  WHERE notify_training_opportunities = true;

-- 6. Remove duplicate indexes (redundant with unique constraints)
DROP INDEX IF EXISTS idx_exploration_cache_query;
DROP INDEX IF EXISTS idx_exploration_queries_created;
DROP INDEX IF EXISTS idx_announcement_reads_user_id;
DROP INDEX IF EXISTS idx_audit_log_created;
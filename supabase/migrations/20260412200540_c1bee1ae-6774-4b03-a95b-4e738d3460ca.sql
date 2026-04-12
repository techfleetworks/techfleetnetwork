-- Performance indexes for enterprise scale (10,000+ users)
-- These prevent full table scans on the hottest query paths.

-- journey_progress: queried on every course page and journey view
CREATE INDEX IF NOT EXISTS idx_journey_progress_user_phase
  ON public.journey_progress (user_id, phase);

CREATE INDEX IF NOT EXISTS idx_journey_progress_user_phase_completed
  ON public.journey_progress (user_id, phase, completed)
  WHERE completed = true;

-- notifications: polled every 30s per active user
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, read)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- exploration_queries: aggregated for popular queries
CREATE INDEX IF NOT EXISTS idx_exploration_queries_created
  ON public.exploration_queries (created_at DESC);

-- exploration_cache: looked up by normalized key
CREATE INDEX IF NOT EXISTS idx_exploration_cache_query_normalized
  ON public.exploration_cache (query_normalized);

-- announcement_reads: joined with announcements per user
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user
  ON public.announcement_reads (user_id);

-- general_applications: filtered by user + status
CREATE INDEX IF NOT EXISTS idx_general_applications_user_status
  ON public.general_applications (user_id, status);

-- project_applications: looked up by user and by project
CREATE INDEX IF NOT EXISTS idx_project_applications_user
  ON public.project_applications (user_id);

CREATE INDEX IF NOT EXISTS idx_project_applications_project
  ON public.project_applications (project_id);

-- audit_log: purged by date, filtered by event type
CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON public.audit_log (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type
  ON public.audit_log (event_type);

-- feedback: admin listing ordered by date
CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON public.feedback (created_at DESC);

-- profiles: looked up by user_id constantly
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
  ON public.profiles (user_id);

-- class_certifications: looked up by user
CREATE INDEX IF NOT EXISTS idx_class_certifications_user
  ON public.class_certifications (user_id);

-- project_certifications: looked up by user
CREATE INDEX IF NOT EXISTS idx_project_certifications_user
  ON public.project_certifications (user_id);
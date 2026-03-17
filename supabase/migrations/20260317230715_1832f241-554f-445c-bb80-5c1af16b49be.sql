
-- ============================================================
-- PERFORMANCE INDEXES: Add missing indexes on hot query paths
-- ============================================================

-- journey_progress: Most queries filter by (user_id, phase)
CREATE INDEX IF NOT EXISTS idx_journey_progress_user_phase 
  ON public.journey_progress (user_id, phase);

-- journey_progress: Completed count queries add completed filter
CREATE INDEX IF NOT EXISTS idx_journey_progress_user_phase_completed 
  ON public.journey_progress (user_id, phase) WHERE completed = true;

-- announcement_reads: Always queried by user_id
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id 
  ON public.announcement_reads (user_id);

-- audit_log: Admin queries order by created_at, filter by event_type
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
  ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type 
  ON public.audit_log (event_type);

-- email_send_log: Queue processor looks up by message_id + status
CREATE INDEX IF NOT EXISTS idx_email_send_log_message_status 
  ON public.email_send_log (message_id, status);

-- profiles: Announcement emails filter by notify_announcements
CREATE INDEX IF NOT EXISTS idx_profiles_notify_announcements 
  ON public.profiles (notify_announcements) WHERE notify_announcements = true;

-- user_roles: Queried on every page via useAdmin (user_id, role)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role 
  ON public.user_roles (user_id, role);

-- rate_limits: Cleanup and lookup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_action 
  ON public.rate_limits (identifier, action);

-- chat_conversations: RLS and queries filter by user_id
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id 
  ON public.chat_conversations (user_id);

-- chat_messages: JOIN lookups on conversation_id
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id 
  ON public.chat_messages (conversation_id);

-- general_applications: User queries
CREATE INDEX IF NOT EXISTS idx_general_applications_user_id 
  ON public.general_applications (user_id);

-- suppressed_emails: Lookup by email
CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email 
  ON public.suppressed_emails (email);

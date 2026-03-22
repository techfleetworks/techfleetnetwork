
-- ============================================================
-- ENTERPRISE LOCKDOWN: Ensure RLS is enabled on ALL tables
-- and add restrictive policies where missing
-- ============================================================

-- 1. rate_limits: Enable RLS + restrict to service_role only
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only - select"
  ON public.rate_limits FOR SELECT
  TO public
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role only - insert"
  ON public.rate_limits FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only - update"
  ON public.rate_limits FOR UPDATE
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only - delete"
  ON public.rate_limits FOR DELETE
  TO public
  USING (auth.role() = 'service_role');

-- 2. invitations: Enable RLS + restrict to service_role and admins
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage invitations"
  ON public.invitations FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can view invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert invitations"
  ON public.invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. FORCE RLS on all tables (ensures even table owners respect RLS)
ALTER TABLE public.admin_promotions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bdd_scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.general_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.grid_view_states FORCE ROW LEVEL SECURITY;
ALTER TABLE public.handbooks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.journey_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base FORCE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_reference FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workshops FORCE ROW LEVEL SECURITY;

-- 4. Revoke direct table access from anon role on all tables
REVOKE ALL ON public.admin_promotions FROM anon;
REVOKE ALL ON public.announcement_reads FROM anon;
REVOKE ALL ON public.announcements FROM anon;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.bdd_scenarios FROM anon;
REVOKE ALL ON public.chat_conversations FROM anon;
REVOKE ALL ON public.chat_messages FROM anon;
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.dashboard_preferences FROM anon;
REVOKE ALL ON public.email_send_log FROM anon;
REVOKE ALL ON public.email_send_state FROM anon;
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon;
REVOKE ALL ON public.feedback FROM anon;
REVOKE ALL ON public.general_applications FROM anon;
REVOKE ALL ON public.grid_view_states FROM anon;
REVOKE ALL ON public.handbooks FROM anon;
REVOKE ALL ON public.invitations FROM anon;
REVOKE ALL ON public.journey_progress FROM anon;
REVOKE ALL ON public.knowledge_base FROM anon;
REVOKE ALL ON public.milestone_reference FROM anon;
REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.project_applications FROM anon;
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.rate_limits FROM anon;
REVOKE ALL ON public.suppressed_emails FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.workshops FROM anon;

-- 5. Revoke anon from database functions that should be internal-only
REVOKE EXECUTE ON FUNCTION public.check_rate_limit FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_stuck_email_queue FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_email FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_email FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_email_batch FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_old_audit_logs FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_rate_limit FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_network_stats FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_country_distribution FROM anon;

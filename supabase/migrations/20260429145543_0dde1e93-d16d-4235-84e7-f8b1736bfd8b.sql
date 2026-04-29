DROP POLICY IF EXISTS "service role can manage fanout jobs" ON public.notification_fanout_jobs;

CREATE POLICY "service role can manage fanout jobs"
ON public.notification_fanout_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.notification_fanout_jobs IS 'Backend-only notification queue. Writes are performed by trusted service-role jobs and security-definer notification functions; admins may view status for monitoring.';
COMMENT ON TABLE public.project_roster IS 'Admin-only sensitive roster source containing member email, performance notes, and contribution metadata. Member-safe access must use dedicated redacted views or backend functions, not direct table reads.';
COMMENT ON TABLE public.profiles IS 'Owner/admin scoped profile store containing PII and membership metadata. Public endpoints must select only non-sensitive display fields and apply DLP redaction before responding.';
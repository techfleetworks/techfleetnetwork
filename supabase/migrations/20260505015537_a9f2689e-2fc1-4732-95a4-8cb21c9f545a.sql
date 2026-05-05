DROP VIEW IF EXISTS public.audit_triage_state;
CREATE VIEW public.audit_triage_state
WITH (security_invoker = true) AS
SELECT a.id AS audit_id,
       a.error_fingerprint,
       q.status AS triage_status,
       q.id AS fix_queue_id,
       CASE
         WHEN EXISTS (SELECT 1 FROM public.known_issue_catalog k
                       WHERE k.is_active
                         AND (k.expires_at IS NULL OR k.expires_at > now())
                         AND ((k.match_kind='substring'   AND a.error_message ILIKE '%'||k.pattern||'%') OR
                              (k.match_kind='fingerprint' AND a.error_fingerprint = k.pattern)))
         THEN 'silenced'
         ELSE NULL
       END AS silence_state
FROM public.audit_log a
LEFT JOIN public.agent_fix_queue q ON q.fingerprint = a.error_fingerprint
WHERE a.error_fingerprint IS NOT NULL;
REVOKE ALL ON public.audit_triage_state FROM anon;
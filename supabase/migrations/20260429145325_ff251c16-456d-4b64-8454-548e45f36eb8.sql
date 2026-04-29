DROP POLICY IF EXISTS "Users can create own audit events" ON public.audit_log;
DROP POLICY IF EXISTS "Users can create validated own audit events" ON public.audit_log;

CREATE POLICY "Users can create validated own audit events"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND current_setting('app.audit_log_context', true) = 'write_audit_log'
  AND (
    actor_email IS NULL
    OR lower(actor_email) = lower(NULLIF(auth.jwt() ->> 'email', ''))
  )
  AND event_type ~ '^[a-z][a-z0-9_:-]{2,80}$'
  AND table_name ~ '^[a-z][a-z0-9_]{1,80}$'
  AND (record_id IS NULL OR length(record_id) <= 200)
  AND (changed_fields IS NULL OR cardinality(changed_fields) <= 50)
  AND (error_message IS NULL OR length(error_message) <= 1000)
);
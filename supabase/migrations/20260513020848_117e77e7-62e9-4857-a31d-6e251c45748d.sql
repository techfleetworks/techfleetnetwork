-- Enable RLS on realtime.messages and add topic-restricted policies
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop prior versions if re-running
DROP POLICY IF EXISTS "Admins only on admin realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated read non-admin realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated write non-admin realtime topics" ON realtime.messages;

-- Admin-only topics: system_health_state, system_remediations (and any topic prefixed with admin:)
CREATE POLICY "Admins only on admin realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() IN ('system_health_state', 'system_remediations')
         OR realtime.topic() LIKE 'admin:%'
    THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE true
  END
);

CREATE POLICY "Admins only write on admin realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() IN ('system_health_state', 'system_remediations')
         OR realtime.topic() LIKE 'admin:%'
    THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE true
  END
);

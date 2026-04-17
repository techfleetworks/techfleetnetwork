
-- Explicit deny: no client access at all. Only service-role bypasses RLS.
CREATE POLICY "No client access to recovery tokens"
  ON public.passkey_recovery_tokens FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "No client access to login challenges"
  ON public.passkey_login_challenges FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

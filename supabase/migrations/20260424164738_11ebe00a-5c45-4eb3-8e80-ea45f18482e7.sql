
CREATE POLICY "Deny all client access to device binding nonces"
  ON public.device_binding_nonces
  FOR ALL
  USING (false)
  WITH CHECK (false);


CREATE OR REPLACE FUNCTION public._diag_list_vault_names()
RETURNS TABLE(name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT name FROM vault.decrypted_secrets ORDER BY name;
$$;
REVOKE ALL ON FUNCTION public._diag_list_vault_names() FROM PUBLIC, anon, authenticated;

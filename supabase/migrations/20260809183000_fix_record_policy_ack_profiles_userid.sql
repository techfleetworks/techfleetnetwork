-- Audit T-A: record_policy_ack UPDATEd public.profiles WHERE id = auth.uid().
-- profiles.id is the random PK; the auth identity column is user_id. So the
-- UPDATE matched 0 rows and electronic_comms_consent_at was NEVER persisted —
-- the consent record was understated. Fix: key on user_id = auth.uid().
-- CREATE OR REPLACE preserves the existing EXECUTE grants (authenticated, anon).

CREATE OR REPLACE FUNCTION public.record_policy_ack(
  p_policy_keys text[], p_version text, p_method text, p_ip inet, p_user_agent text,
  p_electronic_comms boolean, p_anon_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF p_method NOT IN ('checkbox','google-oauth','re-accept','registration') THEN
    RAISE EXCEPTION 'invalid method';
  END IF;
  FOREACH k IN ARRAY p_policy_keys LOOP
    INSERT INTO public.policy_acknowledgments
      (user_id, anon_id, policy_key, version, method, ip, user_agent, electronic_comms_consent)
    VALUES (auth.uid(), p_anon_id, k, p_version, p_method, p_ip, p_user_agent, COALESCE(p_electronic_comms,false));
  END LOOP;
  IF auth.uid() IS NOT NULL AND COALESCE(p_electronic_comms,false) THEN
    -- T-A FIX: previously keyed on the random PK column, which never equals the
    -- auth uid, so this UPDATE matched 0 rows. The auth identity column is user_id.
    UPDATE public.profiles SET electronic_comms_consent_at = COALESCE(electronic_comms_consent_at, now())
     WHERE user_id = auth.uid();
  END IF;
END $$;

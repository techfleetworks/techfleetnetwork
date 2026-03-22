
-- =====================================================
-- SOC 2 / ISO 27001 / HIPAA Compliance Controls
-- =====================================================

-- 1. PII ACCESS AUDIT FUNCTION (HIPAA §164.312(b) — Audit Controls)
-- Logs every admin SELECT on profiles via a callable function
CREATE OR REPLACE FUNCTION public.log_pii_access(
  p_accessed_user_id uuid,
  p_access_reason text DEFAULT 'admin_view'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (
    event_type, table_name, record_id, user_id, changed_fields
  ) VALUES (
    'pii_access',
    'profiles',
    p_accessed_user_id::text,
    auth.uid(),
    ARRAY[p_access_reason]
  );
END;
$$;

-- Revoke from anon, grant only to authenticated
REVOKE ALL ON FUNCTION public.log_pii_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_pii_access(uuid, text) TO authenticated;

-- 2. DATA EXPORT FUNCTION (GDPR Art 20 / HIPAA Right of Access)
-- Returns all user data as JSON for data portability
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Log the export request
  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
  VALUES ('data_export_requested', 'profiles', v_uid::text, v_uid, ARRAY['full_export']);

  SELECT jsonb_build_object(
    'exported_at', now()::text,
    'user_id', v_uid::text,
    'profile', (SELECT row_to_json(p) FROM public.profiles p WHERE p.user_id = v_uid),
    'general_applications', COALESCE((
      SELECT jsonb_agg(row_to_json(ga))
      FROM public.general_applications ga WHERE ga.user_id = v_uid
    ), '[]'::jsonb),
    'project_applications', COALESCE((
      SELECT jsonb_agg(row_to_json(pa))
      FROM public.project_applications pa WHERE pa.user_id = v_uid
    ), '[]'::jsonb),
    'journey_progress', COALESCE((
      SELECT jsonb_agg(row_to_json(jp))
      FROM public.journey_progress jp WHERE jp.user_id = v_uid
    ), '[]'::jsonb),
    'chat_conversations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'conversation', row_to_json(cc),
        'messages', COALESCE((
          SELECT jsonb_agg(row_to_json(cm) ORDER BY cm.created_at)
          FROM public.chat_messages cm WHERE cm.conversation_id = cc.id
        ), '[]'::jsonb)
      ))
      FROM public.chat_conversations cc WHERE cc.user_id = v_uid
    ), '[]'::jsonb),
    'feedback', COALESCE((
      SELECT jsonb_agg(row_to_json(f))
      FROM public.feedback f WHERE f.user_id = v_uid
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(row_to_json(n))
      FROM public.notifications n WHERE n.user_id = v_uid
    ), '[]'::jsonb),
    'dashboard_preferences', (
      SELECT row_to_json(dp) FROM public.dashboard_preferences dp WHERE dp.user_id = v_uid
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.export_my_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- 3. PII COLUMN CLASSIFICATION (ISO 27001 A.8.2 — Information Classification)
-- Tag every PII column for automated compliance scanning

COMMENT ON COLUMN public.profiles.email IS 'PII:email — User email address. Classification: CONFIDENTIAL. Retention: account lifetime + 7 years.';
COMMENT ON COLUMN public.profiles.first_name IS 'PII:name — User first name. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.profiles.last_name IS 'PII:name — User last name. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.profiles.display_name IS 'PII:name — User display name. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'PII:image — User profile photo URL. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.bio IS 'PII:freetext — User biography. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.country IS 'PII:location — User country. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.timezone IS 'PII:location — User timezone. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.linkedin_url IS 'PII:social — LinkedIn profile URL. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.profiles.portfolio_url IS 'PII:social — Portfolio URL. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.discord_username IS 'PII:social — Discord username. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.discord_user_id IS 'PII:identifier — Discord user ID. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.profiles.professional_background IS 'PII:freetext — Professional background. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.profiles.professional_goals IS 'PII:freetext — Professional goals. Classification: INTERNAL.';
COMMENT ON COLUMN public.profiles.user_id IS 'PII:identifier — Foreign key to auth.users. Classification: RESTRICTED.';

COMMENT ON COLUMN public.general_applications.email IS 'PII:email — Applicant email. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.general_applications.linkedin_url IS 'PII:social — Applicant LinkedIn. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.general_applications.portfolio_url IS 'PII:social — Applicant portfolio. Classification: INTERNAL.';
COMMENT ON COLUMN public.general_applications.about_yourself IS 'PII:freetext — May contain personal details. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.general_applications.user_id IS 'PII:identifier — FK to auth.users. Classification: RESTRICTED.';

COMMENT ON COLUMN public.feedback.user_email IS 'PII:email — Submitter email. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.feedback.user_id IS 'PII:identifier — FK to auth.users. Classification: RESTRICTED.';
COMMENT ON COLUMN public.feedback.message IS 'PII:freetext — May contain personal details. Classification: CONFIDENTIAL.';

COMMENT ON COLUMN public.audit_log.user_id IS 'PII:identifier — Actor user ID. Classification: RESTRICTED. Required for compliance trail.';
COMMENT ON COLUMN public.audit_log.ip_address IS 'PII:network — Client IP address. Classification: CONFIDENTIAL.';

COMMENT ON COLUMN public.suppressed_emails.email IS 'PII:email — Suppressed email address. Classification: CONFIDENTIAL.';
COMMENT ON COLUMN public.email_send_log.recipient_email IS 'PII:email — Email recipient. Classification: CONFIDENTIAL.';

-- 4. Table-level classification comments (ISO 27001 A.8.2)
COMMENT ON TABLE public.profiles IS 'Contains PII. Classification: CONFIDENTIAL. Retention: account lifetime + 7 years. HIPAA: PHI-adjacent. Access: owner + admin.';
COMMENT ON TABLE public.general_applications IS 'Contains PII. Classification: CONFIDENTIAL. Retention: 7 years after submission. Access: owner + admin.';
COMMENT ON TABLE public.feedback IS 'Contains PII. Classification: CONFIDENTIAL. Retention: 7 years. Access: owner + admin.';
COMMENT ON TABLE public.audit_log IS 'Compliance audit trail. Classification: RESTRICTED. Retention: 7 years (SOC 2 / HIPAA). Access: admin only. DO NOT PURGE without compliance review.';
COMMENT ON TABLE public.chat_conversations IS 'Contains user-generated content. Classification: CONFIDENTIAL. Retention: account lifetime. Access: owner only.';
COMMENT ON TABLE public.chat_messages IS 'Contains user-generated content. Classification: CONFIDENTIAL. Retention: account lifetime. Access: owner only.';
COMMENT ON TABLE public.notifications IS 'May reference PII in body. Classification: INTERNAL. Retention: 90 days recommended. Access: owner only.';
COMMENT ON TABLE public.user_roles IS 'Access control data. Classification: RESTRICTED. Changes audited. Access: admin + owner (read).';

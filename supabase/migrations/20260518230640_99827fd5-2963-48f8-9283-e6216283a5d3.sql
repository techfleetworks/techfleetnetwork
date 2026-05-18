-- Backfill community agreement prompts for existing active participants
-- whose applications became active before the agreement feature shipped.
DO $$
DECLARE
  r RECORD;
  v_project_name text;
  v_client_name text;
  v_body_html text;
BEGIN
  FOR r IN
    SELECT pa.id, pa.user_id, pa.project_id
    FROM public.project_applications pa
    WHERE pa.applicant_status = 'active_participant'
      AND pa.community_agreement_signed_at IS NULL
  LOOP
    -- Mark required_at if not set
    PERFORM public.mark_community_agreement_required(r.id);

    -- Resolve project + client names
    SELECT p.friendly_name, c.name
      INTO v_project_name, v_client_name
      FROM public.projects p
      LEFT JOIN public.clients c ON c.id = p.client_id
     WHERE p.id = r.project_id;

    v_body_html :=
      '<p>Congratulations! You have been selected to be a part of <strong>' ||
      COALESCE(NULLIF(v_project_name, ''), COALESCE(NULLIF(v_client_name,''), 'your Tech Fleet project')) ||
      '</strong> with the nonprofit client <strong>' ||
      COALESCE(NULLIF(v_client_name, ''), 'a nonprofit client') ||
      '</strong>.</p>' ||
      '<p>Before you begin your team training, you need to review and agree to the Community Terms and Conditions for trainees. Click below to review and agree.</p>';

    -- Only insert if we have not already created one for this application
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = r.user_id
        AND n.notification_type = 'community_agreement_request'
        AND n.link_url = '/applications/projects/' || r.id::text || '/status?agreement=open'
    ) THEN
      PERFORM public.safe_create_notification(
        r.user_id,
        'Sign Community Agreement',
        v_body_html,
        'community_agreement_request',
        '/applications/projects/' || r.id::text || '/status?agreement=open',
        'backfill-community-agreement'
      );
    END IF;
  END LOOP;
END $$;
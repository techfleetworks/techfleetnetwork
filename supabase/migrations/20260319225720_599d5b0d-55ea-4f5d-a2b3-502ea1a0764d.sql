-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  notification_type text NOT NULL DEFAULT 'general',
  link_url text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can update (mark read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role / triggers can insert notifications
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT TO public
  WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated insert for trigger context (SECURITY DEFINER functions)
-- The trigger function runs as SECURITY DEFINER so it bypasses RLS

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create function to generate notifications when a project opens
CREATE OR REPLACE FUNCTION public.notify_project_opening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_name text;
  v_project_type text;
  v_phase text;
  v_body text;
  v_user record;
BEGIN
  -- Only fire when project_status changes TO 'apply_now'
  IF NEW.project_status = 'apply_now' AND (OLD.project_status IS DISTINCT FROM 'apply_now') THEN
    -- Get client info
    SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
    v_project_type := REPLACE(INITCAP(REPLACE(NEW.project_type::text, '_', ' ')), '_', ' ');
    v_phase := REPLACE(INITCAP(REPLACE(NEW.phase::text, '_', ' ')), '_', ' ');

    v_body := '<p><strong>Client:</strong> ' || COALESCE(v_client_name, 'Unknown') ||
              '</p><p><strong>Project Type:</strong> ' || v_project_type ||
              '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';

    -- Find all users who have "Train on project teams" in interests
    -- AND have notify_training_opportunities enabled
    FOR v_user IN
      SELECT p.user_id, p.email, p.notify_announcements, p.first_name
      FROM public.profiles p
      WHERE p.notify_training_opportunities = true
        AND 'Train on project teams' = ANY(p.interests)
    LOOP
      -- Insert in-app notification
      INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
      VALUES (
        v_user.user_id,
        'ALERT! New Project Training Opportunity',
        v_body,
        'project_opening',
        '/project-openings/' || NEW.id
      );

      -- If user also has email notifications enabled, enqueue email
      IF v_user.notify_announcements = true AND v_user.email != '' THEN
        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'to', v_user.email,
            'subject', 'ALERT! New Project Training Opportunity',
            'html', '<h2>ALERT! New Project Training Opportunity</h2>' ||
                    '<p>Hi ' || COALESCE(v_user.first_name, 'there') || ',</p>' ||
                    '<p>A new project training opportunity is now open for applications!</p>' ||
                    v_body ||
                    '<p><a href="https://techfleetnetwork.lovable.app/project-openings/' || NEW.id || '">View Project &amp; Apply</a></p>',
            'template_name', 'project_opening_alert',
            'purpose', 'transactional'
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on projects table
CREATE TRIGGER trg_notify_project_opening
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_opening();
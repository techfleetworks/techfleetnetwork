-- Push subscription storage for Web Push notifications
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role needs access to read subscriptions when sending push
CREATE POLICY "Service role can read all push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO public
  USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add push_subscriptions to user deletion cleanup
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.push_subscriptions WHERE user_id = OLD.id;
  DELETE FROM public.chat_messages WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = OLD.id
  );
  DELETE FROM public.chat_conversations WHERE user_id = OLD.id;
  DELETE FROM public.journey_progress WHERE user_id = OLD.id;
  DELETE FROM public.announcement_reads WHERE user_id = OLD.id;
  DELETE FROM public.dashboard_preferences WHERE user_id = OLD.id;
  DELETE FROM public.grid_view_states WHERE user_id = OLD.id;
  DELETE FROM public.project_applications WHERE user_id = OLD.id;
  DELETE FROM public.general_applications WHERE user_id = OLD.id;
  DELETE FROM public.admin_promotions WHERE user_id = OLD.id;
  DELETE FROM public.user_roles WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.feedback WHERE user_id = OLD.id;
  DELETE FROM public.audit_log WHERE user_id = OLD.id;
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;
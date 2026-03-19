-- Cascade-delete user data when a user is removed from auth.users
-- This prevents orphaned records in application tables

CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete dependent records that reference user_id
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
  DELETE FROM public.audit_log WHERE user_id = OLD.id;
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;

-- Attach trigger to auth.users BEFORE delete
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_deletion();
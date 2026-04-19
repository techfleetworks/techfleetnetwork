
CREATE TABLE IF NOT EXISTS public.signup_confirmation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_reminders_user_id ON public.signup_confirmation_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_signup_reminders_sent_at ON public.signup_confirmation_reminders(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_reminders_email ON public.signup_confirmation_reminders(lower(email));

ALTER TABLE public.signup_confirmation_reminders ENABLE ROW LEVEL SECURITY;

-- No policies = no public/authenticated access. Only service role (which bypasses RLS) can read/write.
-- Admins can view via service-role queries from edge functions if needed later.

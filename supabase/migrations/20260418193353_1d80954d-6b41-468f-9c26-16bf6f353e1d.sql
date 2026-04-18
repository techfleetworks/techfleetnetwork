-- Dedupe email_unsubscribe_tokens: keep oldest unused token per email (or oldest if all used)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY email
           ORDER BY (used_at IS NOT NULL), created_at ASC
         ) AS rn
  FROM public.email_unsubscribe_tokens
)
DELETE FROM public.email_unsubscribe_tokens
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Add unique constraint to prevent future duplicates (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'email_unsubscribe_tokens_email_key'
  ) THEN
    ALTER TABLE public.email_unsubscribe_tokens
      ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);
  END IF;
END $$;
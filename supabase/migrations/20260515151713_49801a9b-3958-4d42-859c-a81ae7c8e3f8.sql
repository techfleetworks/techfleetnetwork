ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_summary_check;
ALTER TABLE public.classes ADD CONSTRAINT classes_summary_check CHECK (length(summary) BETWEEN 1 AND 10000);
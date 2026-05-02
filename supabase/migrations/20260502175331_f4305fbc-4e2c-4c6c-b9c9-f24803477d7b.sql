ALTER TABLE public.classes ALTER COLUMN outcomes DROP DEFAULT;

ALTER TABLE public.classes
  ALTER COLUMN outcomes TYPE text
  USING (
    CASE
      WHEN outcomes IS NULL OR array_length(outcomes, 1) IS NULL THEN ''
      ELSE '<ul><li>' || array_to_string(outcomes, '</li><li>') || '</li></ul>'
    END
  );

ALTER TABLE public.classes ALTER COLUMN outcomes SET DEFAULT '';
ALTER TABLE public.classes ALTER COLUMN outcomes SET NOT NULL;
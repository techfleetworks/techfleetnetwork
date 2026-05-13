
CREATE OR REPLACE FUNCTION public.sanitize_classes_html()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.summary IS NOT NULL THEN
    NEW.summary := public.sanitize_user_html(NEW.summary);
  END IF;
  IF NEW.description IS NOT NULL THEN
    NEW.description := public.sanitize_user_html(NEW.description);
  END IF;
  IF NEW.why_take IS NOT NULL THEN
    NEW.why_take := public.sanitize_user_html(NEW.why_take);
  END IF;
  IF NEW.outcomes IS NOT NULL THEN
    NEW.outcomes := public.sanitize_user_html(NEW.outcomes);
  END IF;
  IF NEW.audiences IS NOT NULL THEN
    NEW.audiences := public.sanitize_user_html(NEW.audiences);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_classes_html ON public.classes;
CREATE TRIGGER trg_sanitize_classes_html
BEFORE INSERT OR UPDATE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_classes_html();

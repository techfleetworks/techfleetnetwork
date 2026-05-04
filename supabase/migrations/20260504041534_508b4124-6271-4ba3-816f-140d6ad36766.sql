
-- 1. security_invoker on cost daily view
ALTER VIEW public.fleety_cost_daily SET (security_invoker = true);

-- 2. Admin read policy on response cache (table)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fleety_response_cache' AND policyname='Admins read fleety_response_cache'
  ) THEN
    EXECUTE $p$CREATE POLICY "Admins read fleety_response_cache" ON public.fleety_response_cache FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))$p$;
  END IF;
END $$;

-- 3. Auto-bump kb_version on knowledge_base mutation
CREATE OR REPLACE FUNCTION public.tg_bump_kb_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bump_kb_version();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_bump_version ON public.knowledge_base;
CREATE TRIGGER trg_kb_bump_version
AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_base
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_bump_kb_version();

-- 6. Drop duplicate fleety_cache_store overload (6-arg dead variant)
DROP FUNCTION IF EXISTS public.fleety_cache_store(text, text, text, text, jsonb, text);

-- 7. Lock down maintenance/purge functions
REVOKE EXECUTE ON FUNCTION public.fleety_purge_cache_for_turn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_purge_cache_for_turn() TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (p.proname LIKE 'prune_%' OR p.proname IN ('bump_kb_version','notify_email_queue_worker','tg_bump_kb_version'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

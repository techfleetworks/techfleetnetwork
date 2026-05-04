
-- ============================================================
-- Fleety Cost Plan v2 — Phase 2: Cache + Canned promotion
-- ============================================================

-- 1. Track last turn served by a cache row (for thumbs-down purge)
ALTER TABLE public.fleety_response_cache
  ADD COLUMN IF NOT EXISTS last_turn_id uuid;

CREATE INDEX IF NOT EXISTS idx_fleety_response_cache_last_turn
  ON public.fleety_response_cache (last_turn_id)
  WHERE last_turn_id IS NOT NULL;

-- 2. Semantic cache lookup — match by query embedding, not just hash.
-- Returns the best cached row for the current kb_version + audience whose
-- cosine distance is below the threshold and whose row is fresh (<7d).
CREATE OR REPLACE FUNCTION public.fleety_cache_semantic_lookup(
  _query_embedding extensions.vector(1536),
  _audience text,
  _max_distance double precision DEFAULT 0.05  -- ~0.95 cosine sim
)
RETURNS TABLE (
  query_hash text,
  response_md text,
  sources jsonb,
  tier text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  current_v bigint;
BEGIN
  SELECT version INTO current_v FROM public.fleety_kb_version WHERE id = true;

  RETURN QUERY
  SELECT c.query_hash,
         c.response_md,
         c.sources,
         c.tier,
         (1 - (c.query_embedding <=> _query_embedding))::double precision AS similarity
    FROM public.fleety_response_cache c
   WHERE c.audience = _audience
     AND c.kb_version = current_v
     AND c.query_embedding IS NOT NULL
     AND c.last_used_at >= now() - interval '7 days'
     AND (c.query_embedding <=> _query_embedding) <= _max_distance
   ORDER BY c.query_embedding <=> _query_embedding ASC
   LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_cache_semantic_lookup(extensions.vector, text, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_cache_semantic_lookup(extensions.vector, text, double precision) TO service_role;

-- 3. Bump cache_store to also write the embedding + serving turn id.
CREATE OR REPLACE FUNCTION public.fleety_cache_store(
  _query_hash text,
  _query_text text,
  _audience text,
  _response_md text,
  _sources jsonb,
  _tier text,
  _query_embedding extensions.vector(1536) DEFAULT NULL,
  _turn_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  current_v bigint;
BEGIN
  SELECT version INTO current_v FROM public.fleety_kb_version WHERE id = true;

  INSERT INTO public.fleety_response_cache
    (query_hash, query_text, audience, kb_version, response_md, sources, tier,
     query_embedding, last_turn_id)
  VALUES
    (_query_hash, _query_text, _audience, current_v, _response_md, _sources, _tier,
     _query_embedding, _turn_id)
  ON CONFLICT (query_hash) DO UPDATE
    SET response_md  = EXCLUDED.response_md,
        sources      = EXCLUDED.sources,
        tier         = EXCLUDED.tier,
        kb_version   = EXCLUDED.kb_version,
        query_embedding = COALESCE(EXCLUDED.query_embedding, public.fleety_response_cache.query_embedding),
        last_turn_id = EXCLUDED.last_turn_id,
        last_used_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_cache_store(text, text, text, text, jsonb, text, extensions.vector, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_cache_store(text, text, text, text, jsonb, text, extensions.vector, uuid) TO service_role;

-- 4. Bump hit count + update last_turn when a cache entry is reused.
CREATE OR REPLACE FUNCTION public.fleety_cache_record_hit(
  _query_hash text,
  _turn_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.fleety_response_cache
     SET hits = hits + 1,
         last_used_at = now(),
         last_turn_id = COALESCE(_turn_id, last_turn_id)
   WHERE query_hash = _query_hash;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_cache_record_hit(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleety_cache_record_hit(text, uuid) TO service_role;

-- 5. Thumbs-down → purge cache row served by that turn
CREATE OR REPLACE FUNCTION public.fleety_purge_cache_for_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.rating = -1 THEN
    DELETE FROM public.fleety_response_cache
     WHERE last_turn_id = NEW.turn_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleety_feedback_purge_cache
  ON public.fleety_message_feedback;

CREATE TRIGGER trg_fleety_feedback_purge_cache
  AFTER INSERT OR UPDATE OF rating ON public.fleety_message_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.fleety_purge_cache_for_turn();

-- 6. Admin: promote a turn to a canned answer (one-click from System Health → Fleety)
CREATE OR REPLACE FUNCTION public.fleety_promote_turn_to_canned(
  _turn_id uuid,
  _question_pattern text,
  _answer_md text,
  _audience text DEFAULT 'all'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins may promote canned answers';
  END IF;

  IF _question_pattern IS NULL OR length(trim(_question_pattern)) < 3 THEN
    RAISE EXCEPTION 'question_pattern is required';
  END IF;
  IF _answer_md IS NULL OR length(trim(_answer_md)) < 10 THEN
    RAISE EXCEPTION 'answer_md is required';
  END IF;
  IF _audience NOT IN ('all', 'member', 'teacher', 'admin') THEN
    RAISE EXCEPTION 'invalid audience';
  END IF;

  INSERT INTO public.fleety_canned_answers
    (question_pattern, answer_md, audience, source_turn_id, enabled, created_by)
  VALUES
    (_question_pattern, _answer_md, _audience, _turn_id, true, auth.uid())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fleety_promote_turn_to_canned(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleety_promote_turn_to_canned(uuid, text, text, text) TO authenticated;

-- 7. BDD scenarios for Phase 2
INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin)
VALUES
('fleety-cost-controls', 92, 'F-COST-004', 'Semantic cache returns prior answer for similar question',
$gherkin$
Feature: Fleety semantic response cache
  As a platform owner
  I want repeated similar questions to reuse stored answers
  So that AI cost stays bounded at 10K MAU scale

  Scenario: A near-duplicate question hits the cache
    Given a previous turn for the same audience answered "What is a deliverable?" and was stored in fleety_response_cache
    And the kb_version has not changed
    When a new user asks "Can you tell me what a deliverable is?"
    Then the system should call fleety_cache_semantic_lookup with the new query embedding
    And [DB] the matching cache row's hits counter should increment by 1
    And [Code] no AI gateway call should be issued for this turn
    And [UI] the user should see the cached markdown rendered with the same streaming animation
$gherkin$),
('fleety-cost-controls', 92, 'F-COST-005', 'KB version bump invalidates cached responses',
$gherkin$
Feature: Cache invalidation on knowledge base updates
  As an admin
  I want cache entries to expire when content changes
  So that stale facts cannot be served after a KB edit

  Scenario: Updating the KB bumps fleety_kb_version and invalidates lookups
    Given fleety_response_cache has rows at kb_version = 5
    When an admin edits a knowledge_base entry and bump_fleety_kb_version() runs
    Then [DB] fleety_kb_version.version should equal 6
    And [Code] fleety_cache_semantic_lookup should not return any kb_version=5 row for new queries
    And [Code] the next identical query should be answered by the live model and re-stored at kb_version 6
$gherkin$),
('fleety-cost-controls', 92, 'F-COST-006', 'Thumbs-down purges the cache row that served the turn',
$gherkin$
Feature: Negative feedback removes cached answers
  As a user
  I want a thumbs-down to prevent the same poor answer from being reused
  So that response quality recovers immediately

  Scenario: A user thumbs-downs a cached Fleety reply
    Given a fleety_response_cache row whose last_turn_id is T1
    And the user submitted a fleety_message_feedback row with turn_id=T1 and rating=-1
    Then [DB] the trigger trg_fleety_feedback_purge_cache should delete the cache row where last_turn_id=T1
    And [Code] the next identical query should call the live AI model, not the cache
    And [UI] the user sees their thumbs-down acknowledged via toast
$gherkin$)
ON CONFLICT (scenario_id) DO NOTHING;

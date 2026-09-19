-- ADR-0050 — live-derived stats (EXPAND). Course-card completer counts become a live
-- count of the source-of-truth rows (journey_progress), using the exact task_ids the
-- client already sends. Same signature as before, so it is safe to apply before/after the
-- frontend deploys; it stops reading the stored counter `course_completion_stats`.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS). The contract migration that drops the
-- now-unread counter + its trigger/recompute writes lands LATER, once this is verified.

-- Supporting index: count non-test members who completed a given task (course card joins on
-- task_id; the network-stats roll-up joins lesson_catalog.lesson_id = journey_progress.task_id).
CREATE INDEX IF NOT EXISTS idx_journey_progress_completed_task_user
  ON public.journey_progress (task_id, user_id)
  WHERE completed;

CREATE OR REPLACE FUNCTION public.get_course_completion_counts(_course_specs jsonb)
RETURNS TABLE(course_key text, completers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  -- Each spec = {key, phase, task_ids[]}: the course's required tasks, exactly as the card
  -- uses them. A "completer" is a non-test member who has a completed journey_progress row
  -- for EVERY task_id in the spec (for that phase). Because TOTAL_* === task_ids.length in
  -- the app data, this count is identical to "members whose card shows Complete".
  --
  -- `phase` is compared as text (not cast to the journey_phase enum) so an unknown/stale
  -- phase value degrades to 0 for that one course (fail-open) instead of raising and taking
  -- down every course count on the page.
  WITH spec AS (
    SELECT
      (s->>'key')::text                                       AS course_key,
      (s->>'phase')::text                                     AS phase,
      ARRAY(SELECT jsonb_array_elements_text(s->'task_ids'))  AS task_ids
    FROM jsonb_array_elements(COALESCE(_course_specs, '[]'::jsonb)) AS s
  )
  SELECT
    spec.course_key,
    COALESCE(
      count(*) FILTER (
        WHERE cardinality(spec.task_ids) > 0
          AND done.n >= cardinality(spec.task_ids)
      ),
      0
    )::bigint AS completers
  FROM spec
  LEFT JOIN LATERAL (
    SELECT jp.user_id, count(DISTINCT jp.task_id) AS n
    FROM public.journey_progress jp
    JOIN public.profiles p ON p.user_id = jp.user_id
    WHERE jp.completed
      AND jp.phase::text = spec.phase
      AND jp.task_id = ANY(spec.task_ids)
      AND NOT COALESCE(p.is_test_account, false)
    GROUP BY jp.user_id
  ) done ON true
  GROUP BY spec.course_key, spec.task_ids;
$$;

REVOKE ALL ON FUNCTION public.get_course_completion_counts(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_course_completion_counts(jsonb) TO anon, authenticated, service_role;

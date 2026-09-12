-- Retire the framework_overview counts rollup (ADR-0036 schema reconciliation).
--
-- framework_overview_mv (materialized view) + framework_overview_v (plain view over it) + the
-- refresh_framework_overview() helper were created 2026-05-02 (20260502192050 / 20260502192120) but:
--   * are ABSENT from prod (that May migration was never applied),
--   * have ZERO runtime usage (referenced only in generated src/integrations/supabase/types.ts),
--   * were superseded by framework_entity_v and have sat unapplied for 4+ months.
--
-- Leaving the repo declaring objects prod does not have is exactly the drift the ADR-0036 gate
-- (check-db-schema-present) flags. This retires them so the declared state matches reality: the
-- gate nets the CREATE against this DROP and stops expecting them. IF EXISTS makes it a safe,
-- idempotent no-op in prod (the objects are already gone) — apply it for tidiness (it also drops the
-- refresh function should it linger). No cron job schedules refresh_framework_overview, so nothing
-- else depends on these. See docs/architecture/audit-2026-08/adr-0036-RESUME-2.md.

DROP VIEW IF EXISTS public.framework_overview_v;
DROP MATERIALIZED VIEW IF EXISTS public.framework_overview_mv;
DROP FUNCTION IF EXISTS public.refresh_framework_overview();

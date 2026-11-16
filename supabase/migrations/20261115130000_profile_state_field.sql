-- Welcome Flow — add profiles.state (EXPAND, additive only).
-- ADR 20261115-welcome-flow-prototype-fidelity (the prototype's Profile screen collects
-- Country + State; State had no column until now).
--
-- Expand/contract safety (supabase/migrations/CLAUDE.md, ADR-0026): the column is nullable
-- forever (NULL = "not provided"), so this is safe to apply BEFORE the code that writes it
-- ships and safe to leave applied if that code later rolls back. No backfill — existing
-- members simply have no State until they set one.
--
-- profiles is ROW-scoped RLS (auth.uid() = user_id), NOT column-scoped like projects
-- (ADR-0056), so NO per-column GRANT is needed: authenticated already holds table-level
-- SELECT/UPDATE on their own row, and the write goes through ProfileService.updateFields
-- (allow-listed, sanitized) under that RLS. Idempotent (IF NOT EXISTS) so migration-smoke
-- can re-apply from scratch.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS state text;   -- NULL = not provided

COMMENT ON COLUMN public.profiles.state IS
  'Optional state/province/region within profiles.country, collected in the Welcome Flow '
  'Profile step and the profile editor. Free of PII beyond coarse location; nullable forever. '
  'Written only via ProfileService.updateFields (row-scoped RLS). '
  'ADR 20261115-welcome-flow-prototype-fidelity.';

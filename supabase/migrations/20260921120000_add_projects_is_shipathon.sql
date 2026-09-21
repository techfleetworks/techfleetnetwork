-- Shipathon project flag (ADR-0054).
-- When true, the project is a "Shipathon" (a cross-functional hackathon). Applicants still apply,
-- but the project application flow omits the "previous phase" question group and the
-- "what do you know about the client" question. Mirrors public.projects.requires_interview as a
-- project-level boolean flag; defaults false (Shipathon is the opt-in special mode).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_shipathon boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.is_shipathon IS
  'When true, the project is a Shipathon (cross-functional hackathon): the application flow omits the previous-phase question group and the client-knowledge question. Applicants still apply. Mirrors requires_interview as a project-level flag (ADR-0054).';

-- Reachability guard (structural: prevents a silent "feature does nothing").
-- The applicant application flow reads this column as the `authenticated` role via projects.select('*')
-- (ProjectApplicationPage). `authenticated` holds table-level SELECT on public.projects today, so a
-- newly added column is auto-readable -- requires_interview, added the same grant-less way, is read by
-- applicants in production. This column-scoped grant is a harmless no-op under the table-level grant and
-- the safety net if prod grants were ever narrowed to column-level: without it, a hidden column would be
-- omitted by select('*'), read `undefined`, and the flag would silently disable itself with no error.
-- Do NOT grant table-level SELECT here: that would re-expose discord_role_id, discord_role_name,
-- notion_repository_url, and client_intake_url (revoked from authenticated in 20260513025458).
GRANT SELECT (is_shipathon) ON public.projects TO authenticated;

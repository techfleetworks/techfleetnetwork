-- public-access A1b: classes.deliverables — a plain string array of concrete
-- outputs a trainee leaves a class with (e.g. "Portfolio case study",
-- "Deployed demo"). Mirrors the existing classes.skills / classes.prerequisites
-- text[] columns; authored free-text, with suggestion data reused from the
-- existing public.milestone_reference table (no new reference table — ADR
-- 20261116-class-deliverables-reuse-reference). Additive / expand-contract:
-- NOT NULL DEFAULT '{}' so every existing row is immediately valid.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS deliverables text[] NOT NULL DEFAULT '{}';

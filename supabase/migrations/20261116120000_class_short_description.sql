-- Public access (A1): add classes.short_description — a short plain-text card blurb.
--
-- Additive / expand-contract: no behaviour changes for existing reads or writes.
-- Distinct from summary/description (both HTML): short_description is a tight,
-- single-line blurb rendered on the listing and detail CARDS, capped at 140 chars
-- (~2 lines on a 384px card). Plain text, not HTML.
--
-- Ticket 34c1a3bddce58092864bc1ac090fe335 §6.1.
-- ADR: docs/adr/20261116-class-short-description.md.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS short_description text NOT NULL DEFAULT '';

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_short_description_len;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_short_description_len
  CHECK (char_length(short_description) <= 140);

# 20261116 — Class deliverables: free-text array, reuse milestone_reference (no new table)

- Status: Accepted
- Date: 2026-11-16
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access) §6.3
- Related: 20261116-class-short-description (sibling A1 field), ADR-20261116 (public-access gateway)

## Context and problem statement

The public class detail page needs to show the concrete outputs a trainee leaves a
class with ("deliverables"). We need somewhere to author and store them. Projects
already model per-milestone deliverables in `public.milestone_reference`
(`milestone_name` → `deliverables text[]`, `activities text[]`, `skills text[]`),
which the `public-project-detail` edge function already reads under the service role
to render the public project page.

The open question (A1b) was the **reference source** for class deliverables:

1. Create a new class-specific reference/lookup table
   (e.g. `class_deliverable_reference`), or
2. Reuse the existing `milestone_reference` table as the suggestion source and store
   the chosen deliverables directly on the class row.

## Decision

**Reuse `milestone_reference`; do not create a new reference table.**

- `classes.deliverables` is a `text[]` column, authored as free text, mirroring the
  existing `classes.skills` and `classes.prerequisites` columns exactly (same
  `safeStringArraySchema` validator, same `(one per line)` textarea authoring UI,
  same service wiring).
- Any future "suggested deliverables" authoring affordance reads from the existing
  `public.milestone_reference` table rather than a new one. That authoring
  enhancement is Phase B scope, not this data-layer change.

## Consequences

- **Good:** No new table, RLS policy, grant surface, or seed path to own and secure.
  One owner for reference data (`milestone_reference`) instead of two that drift
  (data-ownership question). Deliverables follow a pattern already proven on this
  table (`skills`, `prerequisites`), so it needs no new concepts.
- **Good:** Additive / expand-contract — `NOT NULL DEFAULT '{}'` makes every existing
  row valid immediately; no backfill, no deploy-order window.
- **Trade-off:** `milestone_reference` is semantically project-milestone data. Reusing
  it as a class deliverables *suggestion* source (read-only, Phase B) is acceptable;
  we are explicitly **not** coupling the class schema to it (classes store their own
  `deliverables`, they do not reference `milestone_name`). If class deliverables later
  need their own curated vocabulary, a dedicated table can be added then — this
  decision does not block that, it just declines to build it speculatively now.
- **Enforcement:** item count (≤30), item length (≤200), and XSS rejection are
  enforced at the zod validator layer (`safeStringArraySchema`), covered by
  `src/test/validators/class.test.ts`. The DB column has no CHECK (matching
  `skills`/`prerequisites`); `supabase/tests/class_deliverables_test.sql` guards the
  column shape and default so the expand migration cannot silently regress.

import type { ClassFormValues } from "@/lib/validators/class";
import type { ClassRow } from "@/services/class.service";

/**
 * Empty form values for creating a new class. One source of truth for the
 * create-mode defaults.
 */
export const emptyClassFormValues: ClassFormValues = {
  title: "",
  short_description: "",
  summary: "",
  description: "",
  track: "basic_training",
  hero_image_url: "",
  skills: [],
  outcomes: "",
  why_take: "",
  audiences: "",
  prerequisites: [],
  deliverables: [],
  curriculum: "",
  reading_assignments: "",
  class_expectations: "",
};

/**
 * Map a persisted class row into form values for edit mode.
 *
 * INVARIANT: EVERY field the form edits must be mapped here. Edit-mode autosave
 * reads react-hook-form state, so a persisted column omitted from this mapper is
 * never hydrated — autosave then overwrites that column with its empty default
 * (silent data loss). The completeness of this mapper is enforced by
 * src/test/regression/incidents/class-form-deliverables-autosave-wipe-2026-11.test.ts.
 * Regression: `classes.deliverables` (A1b) was wiped this way until it was added here.
 */
export function classRowToFormValues(row: ClassRow): ClassFormValues {
  // curriculum/reading_assignments/class_expectations are not (yet) on the
  // ClassRow type; read them defensively.
  const r = row as ClassRow & {
    curriculum?: string;
    reading_assignments?: string;
    class_expectations?: string;
  };
  return {
    title: row.title,
    short_description: row.short_description ?? "",
    summary: row.summary,
    description: row.description ?? "",
    track: row.track,
    hero_image_url: row.hero_image_url ?? "",
    skills: row.skills ?? [],
    outcomes: row.outcomes ?? "",
    why_take: row.why_take ?? "",
    audiences: row.audiences ?? "",
    prerequisites: row.prerequisites ?? [],
    deliverables: row.deliverables ?? [],
    curriculum: r.curriculum ?? "",
    reading_assignments: r.reading_assignments ?? "",
    class_expectations: r.class_expectations ?? "",
  };
}

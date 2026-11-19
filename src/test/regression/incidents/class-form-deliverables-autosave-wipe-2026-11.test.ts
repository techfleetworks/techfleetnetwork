import { describe, it, expect } from "vitest";
import { classFormSchema } from "@/lib/validators/class";
import { emptyClassFormValues, classRowToFormValues } from "@/lib/forms/class-form-values";
import type { ClassRow } from "@/services/class.service";

/**
 * Regression: public-access A1b (classes.deliverables).
 *
 * The deliverables field was added to the class form's autosave onSave but NOT
 * hydrated into react-hook-form state (omitted from create defaults and the
 * edit-mode row→form mapping). Edit-mode autosave reads form state, so
 * `values.deliverables` was always undefined → `?? []` → every autosave
 * overwrote classes.deliverables with [] (silent data loss on an existing row).
 *
 * Guard: the create defaults and the row→form mapper must cover EVERY field the
 * form schema edits, so no persisted field can be silently dropped to its empty
 * default by autosave again.
 */

const schemaKeys = Object.keys(classFormSchema.shape).sort();

const sampleRow: ClassRow = {
  id: "11111111-1111-1111-1111-111111111111",
  owner_user_id: "22222222-2222-2222-2222-222222222222",
  title: "Sample class",
  slug: "sample-class",
  track: "basic_training",
  status: "published",
  summary: "<p>Summary</p>",
  short_description: "A short blurb",
  description: "<p>Description</p>",
  hero_image_url: null,
  skills: ["React"],
  deliverables: ["Portfolio case study", "Deployed demo"],
  outcomes: "<p>Outcomes</p>",
  why_take: "<p>Why</p>",
  audiences: "<p>Audiences</p>",
  prerequisites: ["Intro course"],
  submitted_at: null,
  published_at: null,
  archived_at: null,
  archive_reason: null,
  created_at: "2026-11-16T00:00:00Z",
  updated_at: "2026-11-16T00:00:00Z",
};

describe("class form values — autosave wipe regression (A1b, 2026-11)", () => {
  it("create defaults cover every form-schema field", () => {
    expect(Object.keys(emptyClassFormValues).sort()).toEqual(schemaKeys);
  });

  it("row→form mapper covers every form-schema field (no field dropped to its empty default)", () => {
    expect(Object.keys(classRowToFormValues(sampleRow)).sort()).toEqual(schemaKeys);
  });

  it("round-trips deliverables from the persisted row (the field that was being wiped)", () => {
    expect(classRowToFormValues(sampleRow).deliverables).toEqual([
      "Portfolio case study",
      "Deployed demo",
    ]);
  });

  it("round-trips prerequisites too (the sibling array field it was copied from)", () => {
    expect(classRowToFormValues(sampleRow).prerequisites).toEqual(["Intro course"]);
  });
});

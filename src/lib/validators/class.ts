import { z } from "zod";
import {
  safeHtmlSchema,
  safeRequiredTextSchema,
  safeShortTextSchema,
  safeStringArraySchema,
  safeUrlSchema,
} from "@/lib/validators/shared-input";

export const CLASS_TRACKS = ["basic_training", "advanced_training"] as const;
export type ClassTrack = (typeof CLASS_TRACKS)[number];

export const CLASS_STATUSES = ["draft", "pending_review", "published", "archived"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export const classFormSchema = z.object({
  title: safeRequiredTextSchema("Title", 120),
  // Short plain-text card blurb (public-access A1). Distinct from summary/description
  // (HTML, detail page). Capped at 140 to match the DB CHECK + card layout.
  short_description: safeShortTextSchema("Short description", 140).default(""),
  summary: safeHtmlSchema("Summary", 10_000).default(""),
  description: safeHtmlSchema("Description", 50_000).default(""),
  track: z.union([z.literal("basic_training"), z.literal("advanced_training")], {
    message: "Track is required",
  }),
  hero_image_url: safeUrlSchema("Hero image URL", 500).optional().default(""),
  skills: safeStringArraySchema("Skills", 50, 120).default([]),
  outcomes: safeHtmlSchema("Outcomes", 20_000).default(""),
  why_take: safeHtmlSchema("Why take this course?", 20_000).default(""),
  audiences: safeHtmlSchema("Audiences", 20_000).default(""),
  prerequisites: safeStringArraySchema("Prerequisites", 30, 200).default([]),
  // Concrete outputs a trainee leaves the class with (public-access A1b).
  // Free-text array mirroring skills/prerequisites; suggestion data reuses the
  // existing milestone_reference table (ADR 20261116-class-deliverables-reuse-reference).
  deliverables: safeStringArraySchema("Deliverables", 30, 200).default([]),
  // New optional rich-text sections (CLASS-EDIT-EXT-001).
  // Sanitized again at the DB layer by sanitize_classes_html trigger.
  curriculum: safeHtmlSchema("Curriculum", 50_000).default(""),
  reading_assignments: safeHtmlSchema("Reading Assignments", 20_000).default(""),
  class_expectations: safeHtmlSchema("Class Expectations", 20_000).default(""),
});

export type ClassFormValues = z.infer<typeof classFormSchema>;

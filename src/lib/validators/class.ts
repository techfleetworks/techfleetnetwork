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
  summary: safeRequiredTextSchema("Summary", 500),
  description: safeHtmlSchema("Description", 50_000).default(""),
  track: z.union([z.literal("basic_training"), z.literal("advanced_training")], {
    message: "Track is required",
  }),
  hero_image_url: safeUrlSchema("Hero image URL", 500).optional().default(""),
  skills: safeStringArraySchema("Skills", 30, 120).default([]),
  outcomes: safeStringArraySchema("Outcomes", 30, 200).default([]),
  prerequisites: safeStringArraySchema("Prerequisites", 30, 200).default([]),
});

export type ClassFormValues = z.infer<typeof classFormSchema>;

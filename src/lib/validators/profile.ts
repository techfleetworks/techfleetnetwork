import { z } from "zod";

// A03: Input validation with strict sanitization
const safeText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be under ${max} characters`)
    .refine((val) => !/<script/i.test(val), `${label} contains invalid content`);

/** Validate URL format (allow empty) */
const safeUrl = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be under ${max} characters`)
    .refine(
      (val) => val === "" || /^https?:\/\/.+/.test(val),
      `${label} must be a valid URL starting with http:// or https://`
    )
    .refine(
      (val) => !/<script/i.test(val),
      `${label} contains invalid content`
    )
    .optional()
    .default("");

export const ACTIVITY_OPTIONS = [
  "Get mentorship",
  "I'm not sure yet, still exploring",
  "Join a community of practice",
  "Take classes",
  "Train on project teams",
  "Volunteer for Tech Fleet's nonprofit organization",
  "Work with buddies",
] as const;

export const profileSchema = z.object({
  firstName: safeText("First name", 100),
  lastName: safeText("Last name", 100),
  country: safeText("Country", 100),
  timezone: safeText("Timezone", 100),
  discordUsername: z
    .string()
    .trim()
    .max(100, "Discord username must be under 100 characters")
    .refine((val) => !/<script/i.test(val), "Discord username contains invalid content")
    .refine(
      (val) => val === "" || /^[a-zA-Z0-9._]+$/.test(val),
      "Discord username can only contain letters, numbers, dots, and underscores"
    )
    .optional()
    .default(""),
  interests: z
    .array(z.string().max(200))
    .max(20, "Too many interests selected")
    .default([]),
  portfolio_url: safeUrl("Portfolio URL", 500),
  linkedin_url: safeUrl("LinkedIn URL", 500),
  scheduling_url: safeUrl("Scheduling link", 500),
  experience_areas: z.array(z.string().max(200)).max(30).optional().default([]),
  professional_goals: z.string().trim().max(2000).optional().default(""),
  notify_training_opportunities: z.boolean().optional().default(false),
  notify_announcements: z.boolean().optional().default(false),
  education_background: z.array(z.string().max(200)).max(20).optional().default([]),
  has_discord_account: z.boolean().optional().default(true),
});

export type ProfileInput = z.infer<typeof profileSchema>;

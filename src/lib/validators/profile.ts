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
  bio: z
    .string()
    .trim()
    .max(2000, "Bio must be under 2000 characters")
    .refine((val) => !/<script/i.test(val), "Bio contains invalid content")
    .optional()
    .default(""),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * Human labels + resolution guidance for every profile field. Shared by
 * ProfileSetupDialog, ProfileSetupPage, ProfileEditPanel, EditProfilePage
 * so error toasts read identically wherever the schema is used.
 */
export const PROFILE_FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  country: "Country",
  timezone: "Timezone",
  discordUsername: "Discord username",
  interests: "Activity interests",
  portfolio_url: "Portfolio URL",
  linkedin_url: "LinkedIn URL",
  scheduling_url: "Scheduling link",
  experience_areas: "Experience areas",
  professional_goals: "Professional goals",
  education_background: "Education background",
  bio: "Bio",
  general: "Save",
};

export const PROFILE_FIELD_GUIDANCE: Record<string, string> = {
  firstName: "Type your given name (1–100 characters).",
  lastName: "Type your family name (1–100 characters).",
  email: "Use the format name@example.com.",
  country: "Open the picker and start typing to search.",
  timezone: "Open the picker and start typing your city or UTC offset.",
  discordUsername: "Letters, numbers, dots, and underscores only.",
  portfolio_url: "Include the full address starting with http:// or https://.",
  linkedin_url: "Include the full address starting with http:// or https://.",
  scheduling_url: "Include the full address starting with http:// or https://.",
  general: "Try again, or refresh the page if the problem persists.",
};


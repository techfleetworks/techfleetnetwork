import { z } from "zod";

// A03: Input validation with strict sanitization
const safeText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be under ${max} characters`)
    .refine((val) => !/<script/i.test(val), `${label} contains invalid content`);

export const ACTIVITY_OPTIONS = [
  "Take classes",
  "Join a community of practice",
  "Work with buddies",
  "Get mentorship",
  "Train on project teams",
  "Volunteer for Tech Fleet's nonprofit organization",
  "I'm not sure yet, still exploring",
] as const;

export const profileSchema = z.object({
  firstName: safeText("First name", 100),
  lastName: safeText("Last name", 100),
  country: safeText("Country", 100),
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
    .array(z.string())
    .default([]),
});

export type ProfileInput = z.infer<typeof profileSchema>;

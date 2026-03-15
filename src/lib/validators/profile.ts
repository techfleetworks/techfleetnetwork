import { z } from "zod";

// A03: Input validation with strict sanitization
const safeText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be under ${max} characters`)
    .refine((val) => !/<script/i.test(val), `${label} contains invalid content`);

export const profileSchema = z.object({
  firstName: safeText("First name", 100),
  lastName: safeText("Last name", 100),
  country: safeText("Country", 100),
  discordUsername: z
    .string()
    .trim()
    .min(1, "Discord username is required")
    .max(100, "Discord username must be under 100 characters")
    .refine((val) => !/<script/i.test(val), "Discord username contains invalid content")
    .refine(
      (val) => /^[a-zA-Z0-9._]+$/.test(val),
      "Discord username can only contain letters, numbers, dots, and underscores"
    ),
});

export type ProfileInput = z.infer<typeof profileSchema>;

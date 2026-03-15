import { z } from "zod";

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  country: z.string().trim().min(1, "Country is required").max(100),
  discordUsername: z.string().trim().min(1, "Discord username is required").max(100),
});

export type ProfileInput = z.infer<typeof profileSchema>;

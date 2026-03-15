import { z } from "zod";

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(100),
  bio: z.string().trim().min(1, "Bio is required").max(1000),
  background: z.string().trim().min(1, "Professional background is required").max(2000),
});

export type ProfileInput = z.infer<typeof profileSchema>;

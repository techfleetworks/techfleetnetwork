import { z } from "zod";

const safeText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be under ${max} characters`)
    .refine((val) => !/<script/i.test(val), `${label} contains invalid content`);

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Password must be under 128 characters")
  .regex(/[A-Z]/, "One uppercase letter required")
  .regex(/[a-z]/, "One lowercase letter required")
  .regex(/[0-9]/, "One number required")
  .regex(/[^A-Za-z0-9]/, "One special character required");

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export const registerSchema = z.object({
  firstName: safeText("First name", 100),
  lastName: safeText("Last name", 100),
  email: z.string().trim().email("Invalid email address").max(255),
  password: passwordSchema,
  agreedToTerms: z.literal(true, {
    message: "You must agree to the terms and community guidelines.",
  }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

import { z } from "zod";

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
const EMAIL_DANGEROUS_CHARS = /[<>"'`\\\s]/;

export const emailInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Email address is required")
  .max(254, "Email address must be under 254 characters")
  .refine((val) => !EMAIL_DANGEROUS_CHARS.test(val), "Enter a valid email address")
  .refine((val) => EMAIL_PATTERN.test(val), "Enter a valid email address");

const safeText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be under ${max} characters`)
    .refine((val) => !/[<>`]/.test(val), `${label} contains invalid content`)
    .refine((val) => !/[\u0000-\u001F\u007F]/.test(val), `${label} contains invalid content`);

export const passwordSchema = z
  .string()
  .min(12, "At least 12 characters")
  .max(128, "Password must be under 128 characters")
  .regex(/[A-Z]/, "One uppercase letter required")
  .regex(/[a-z]/, "One lowercase letter required")
  .regex(/[0-9]/, "One number required")
  .regex(/[^A-Za-z0-9]/, "One special character required");

export const loginSchema = z.object({
  email: emailInputSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const registerSchema = z.object({
  firstName: safeText("First name", 100),
  lastName: safeText("Last name", 100),
  email: emailInputSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
  agreedToTerms: z.literal(true, {
    message: "You must agree to the terms and community guidelines.",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

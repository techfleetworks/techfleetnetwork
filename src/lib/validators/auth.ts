import { z } from "zod";

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
const EMAIL_DANGEROUS_CHARS = /[<>"'`\\\s]/;
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "mailinator.com",
  "maildrop.cc",
  "moakt.com",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
]);

export function getEmailDomain(value: string): string {
  return value.trim().toLowerCase().split("@").pop()?.replace(/\.+$/, "") ?? "";
}

export function isDisposableEmailDomain(value: string): boolean {
  const domain = getEmailDomain(value);
  if (!domain) return false;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  return Array.from(DISPOSABLE_EMAIL_DOMAINS).some((blockedDomain) => domain.endsWith(`.${blockedDomain}`));
}

export function isStrongPassword(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 128 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export const emailInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Email address is required")
  .max(254, "Email address must be under 254 characters")
  .refine((val) => !EMAIL_DANGEROUS_CHARS.test(val), "Enter a valid email address")
  .refine((val) => EMAIL_PATTERN.test(val), "Enter a valid email address")
  .refine((val) => !isDisposableEmailDomain(val), "Use a permanent email address, not a temporary inbox.");

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
  password: passwordSchema,
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

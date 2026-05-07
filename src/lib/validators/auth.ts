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

export function normalizeEmailInput(value: string): string {
  return value.trim().toLowerCase();
}

export function getEmailDomain(value: string): string {
  return normalizeEmailInput(value).split("@").pop()?.replace(/\.+$/, "") ?? "";
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
  .transform(normalizeEmailInput)
  .refine((val) => val.length >= 3, "Email address is required")
  .refine((val) => val.length <= 254, "Email address must be under 254 characters")
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

/**
 * Region-aware minimum age. Defaults to US baseline 13 (COPPA), bumps to 16 for
 * EEA/UK/CH (GDPR Art. 8 + UK ICO Children's Code), and 14 for KR/CN.
 * Region is the country code stored in the consent state, not a guess.
 */
export const HIGH_AGE_COUNTRIES = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","NL","NO","PL","PT","RO","SK","SI","ES","SE","GB","CH"]);
export const MID_AGE_COUNTRIES = new Set(["KR","CN"]);

export function minAgeForCountry(country: string | null | undefined): number {
  if (!country) return 13;
  const cc = country.toUpperCase();
  if (HIGH_AGE_COUNTRIES.has(cc)) return 16;
  if (MID_AGE_COUNTRIES.has(cc)) return 14;
  return 13;
}

export function ageInYears(birthYear: number, birthMonth: number, birthDay: number, ref = new Date()): number {
  let age = ref.getFullYear() - birthYear;
  const m = ref.getMonth() + 1;
  if (m < birthMonth || (m === birthMonth && ref.getDate() < birthDay)) age -= 1;
  return age;
}

export const dateOfBirthSchema = z.object({
  birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()),
  birthMonth: z.coerce.number().int().min(1).max(12),
  birthDay: z.coerce.number().int().min(1).max(31),
});

export const registerSchema = z.object({
  firstName: safeText("First name", 100),
  lastName: safeText("Last name", 100),
  email: emailInputSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
  birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()),
  birthMonth: z.coerce.number().int().min(1).max(12),
  birthDay: z.coerce.number().int().min(1).max(31),
  countryCode: z.string().nullable().optional(),
  agreedToTerms: z.literal(true, {
    message: "You must agree to the terms and community guidelines.",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
}).refine((data) => {
  const age = ageInYears(data.birthYear, data.birthMonth, data.birthDay);
  return age >= minAgeForCountry(data.countryCode ?? null);
}, {
  message: "You must meet the minimum age for your region to create an account.",
  path: ["birthYear"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

import { z } from "zod";
import { enforceMaxBytes, hasHeaderInjection, hasPathTraversal, hasSqlInjectionPattern, sanitizeHtml } from "@/lib/security";

const ACTIVE_CONTENT = /<\s*(script|iframe|object|embed|svg|math|form|input|button|textarea|select)\b|on[a-z]+\s*=|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|expression\s*\(/i;
const SAFE_TEXT_MAX_BYTES = 50_000;

function rejectUnsafe(value: string) {
  return !ACTIVE_CONTENT.test(value) && !hasHeaderInjection(value) && !hasPathTraversal(value) && !hasSqlInjectionPattern(value);
}

export function normalizeSafeText(value: string, maxBytes = SAFE_TEXT_MAX_BYTES) {
  return enforceMaxBytes(value.trim(), maxBytes);
}

export const safeShortTextSchema = (label: string, max = 200) => z.string().trim().max(max, `${label} must be under ${max} characters`).refine(rejectUnsafe, `${label} contains unsafe content`);

export const safeRequiredTextSchema = (label: string, max = 2_000) => safeShortTextSchema(label, max).min(1, `${label} is required`);

export const safeLongTextSchema = (label: string, max = 10_000) => z.string().trim().max(max, `${label} must be under ${max} characters`).refine(rejectUnsafe, `${label} contains unsafe content`);

export const safeHtmlSchema = (label: string, max = 100_000) => z.string().max(max, `${label} must be under ${max} characters`).transform((value) => sanitizeHtml(value));

export const safeUrlSchema = (label: string, max = 500) => z.string().trim().max(max, `${label} must be under ${max} characters`).refine((value) => value === "" || /^https?:\/\/.+/i.test(value), `${label} must start with http:// or https://`).refine(rejectUnsafe, `${label} contains unsafe content`);

export const safeStringArraySchema = (label: string, maxItems = 30, maxItemLength = 200) => z.array(safeShortTextSchema(label, maxItemLength)).max(maxItems, `Too many ${label.toLowerCase()} selected`);

export function sanitizeRecordFields(fields: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") sanitized[key] = normalizeSafeText(value);
    else if (Array.isArray(value)) sanitized[key] = value.map((item) => (typeof item === "string" ? normalizeSafeText(item, 2_000) : item));
    else sanitized[key] = value;
  }
  return sanitized;
}
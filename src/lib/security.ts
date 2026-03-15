/**
 * Security utilities — OWASP hardening helpers
 * No PII should ever pass through console.log in production.
 */

/** Sanitize a string for safe display (prevents XSS via innerHTML) */
export function sanitizeText(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

/** Strip all HTML tags from input */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/** Validate a URL is safe (no javascript: or data: protocols) */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** Generate a cryptographically random nonce for CSP */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mask PII for logging (show only last 4 chars) */
export function maskPii(value: string): string {
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

/** Constant-time string comparison to prevent timing attacks */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

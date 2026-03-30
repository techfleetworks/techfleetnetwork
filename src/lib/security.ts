/**
 * Security utilities — OWASP hardening helpers
 *
 * Covers: XSS (A7), Injection (A3), SSRF (A10), Prototype Pollution,
 * Timing Attacks, Input Validation, and PII Protection.
 *
 * No PII should ever pass through console.log in production.
 */

// ─── XSS Prevention ─────────────────────────────────────────────────

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

/**
 * Deep-sanitize an object's string values to prevent stored XSS.
 * Recursively strips `<script`, `on*=` event handlers, and `javascript:` from strings.
 */
export function deepSanitize<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj
      .replace(/<script[\s>]/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .replace(/javascript\s*:/gi, "") as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      // Prototype pollution guard: reject __proto__, constructor, prototype keys
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      result[key] = deepSanitize((obj as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return obj;
}

// ─── URL Safety ──────────────────────────────────────────────────────

/** Validate a URL is safe (no javascript: or data: protocols) */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate that a URL points to an allowed external host (anti-SSRF).
 * Use for any user-provided URLs that will be fetched server-side.
 */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,  // Link-local / AWS metadata
  /^\[::1?\]$/,             // IPv6 loopback
  /^metadata\.google\.internal$/i,
];

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname;
    return !BLOCKED_HOST_PATTERNS.some((p) => p.test(host));
  } catch {
    return false;
  }
}

// ─── Cryptographic Helpers ───────────────────────────────────────────

/** Generate a cryptographically random nonce for CSP */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a CSRF token */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── PII Protection ─────────────────────────────────────────────────

/** Mask PII for logging (show only last 4 chars) */
export function maskPii(value: string): string {
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

/** Mask email for logging: j***@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***@***";
  return email[0] + "***" + email.slice(at);
}

// ─── Timing-Safe Comparison ──────────────────────────────────────────

/** Constant-time string comparison to prevent timing attacks */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Input Guards ────────────────────────────────────────────────────

/** Enforce a maximum byte length on a string (prevents oversized payloads) */
export function enforceMaxBytes(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(input);
  if (encoded.length <= maxBytes) return input;
  // Truncate to maxBytes and decode back (may lose trailing multibyte char)
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(encoded.slice(0, maxBytes));
}

/**
 * Detect common SQL injection patterns in user input.
 * Use as an additional defense layer (RLS + parameterized queries are primary).
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION|EXEC)\b.*\b(FROM|INTO|TABLE|SET|WHERE)\b)/i,
  /(['";]\s*(--))/,
  /(\/\*[\s\S]*?\*\/)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
];

export function hasSqlInjectionPattern(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((p) => p.test(input));
}

// ─── Prototype Pollution Guard ───────────────────────────────────────

/**
 * Safe JSON.parse that strips prototype-polluting keys.
 * Use instead of raw JSON.parse for untrusted input.
 */
export function safeJsonParse<T = unknown>(json: string): T {
  return JSON.parse(json, (key, value) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return undefined;
    }
    return value;
  }) as T;
}

// ─── HTML Sanitization (DOMPurify) ──────────────────────────────────

import DOMPurify from "dompurify";

/**
 * Sanitize HTML for safe rendering via dangerouslySetInnerHTML.
 * Strips scripts, event handlers, and dangerous attributes while
 * keeping safe formatting tags.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "a",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "blockquote", "pre", "code", "hr", "img", "div", "span",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "class", "style",
      "width", "height", "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
  });
}

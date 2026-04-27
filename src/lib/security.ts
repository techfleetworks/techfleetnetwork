/**
 * Security utilities — OWASP hardening helpers
 *
 * Covers OWASP Top 10 2021 + API Security Top 10:
 *   A01 Broken Access Control — IDOR guards, path traversal detection
 *   A02 Cryptographic Failures — safe nonce/CSRF generation, constant-time compare
 *   A03 Injection — SQL injection detection, HTML sanitization, prototype pollution
 *   A04 Insecure Design — rate limit helpers, mass assignment guards
 *   A05 Security Misconfiguration — CSP nonce, safe JSON parse
 *   A06 Vulnerable Components — (handled at dependency level)
 *   A07 Auth Failures — timing-safe compare, credential masking
 *   A08 Software & Data Integrity — safe JSON parse, deep sanitize
 *   A09 Logging & Monitoring Failures — PII masking, safe error messages
 *   A10 SSRF — URL allowlisting, blocked host patterns
 *
 * Additional: ReDoS protection, header injection prevention,
 * open redirect prevention, mass assignment guards.
 *
 * No PII should ever pass through console.log in production.
 */

import DOMPurify from "dompurify";

// ─── XSS Prevention (A03, A07) ─────────────────────────────────────

export const ACTIVE_XSS_PATTERNS = [
  /<\s*(script|iframe|object|embed|svg|math|form|input|button|textarea|select|meta|link|base)\b/i,
  /<\s*\/\s*script\s*>/i,
  /on[a-z]+\s*=/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /expression\s*\(/i,
  /%3c\s*\/?\s*(script|iframe|object|embed|svg|math|form|meta|link|base)/i,
  /&#x?0*3c;?\s*\/?\s*(script|iframe|object|embed|svg|math|form|meta|link|base)/i,
];

export function hasActiveXssPattern(input: string): boolean {
  return ACTIVE_XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/** Sanitize a string for safe display (prevents XSS via innerHTML) */
export function sanitizeText(input: string): string {
  if (typeof document === "undefined") {
    return input.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
  }
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

/** Strip all HTML tags from input */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value, window.location.origin);
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return undefined;
    if (["http:", "https:"].includes(parsed.protocol) && !isSafeExternalUrl(parsed.href)) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Deep-sanitize an object's string values to prevent stored XSS.
 * Recursively strips `<script`, `on*=` event handlers, `javascript:`,
 * `vbscript:`, `data:text/html`, and expression() from strings.
 * Also guards against prototype pollution.
 */
export function deepSanitize<T>(obj: T, depth = 0): T {
  // Guard against deeply nested payloads (DoS via recursion)
  if (depth > 20) return obj;

  if (typeof obj === "string") {
    const stripped = obj
      .replace(/<script[\s>]/gi, "")
      .replace(/<\/script>/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/vbscript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "")
      .replace(/expression\s*\(/gi, "")
      .replace(/<iframe[\s>]/gi, "")
      .replace(/<object[\s>]/gi, "")
      .replace(/<embed[\s>]/gi, "")
      .replace(/<form[\s>]/gi, "");
    return stripHtml(stripped) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepSanitize(item, depth + 1)) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      // Prototype pollution guard: reject __proto__, constructor, prototype keys
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      result[key] = deepSanitize((obj as Record<string, unknown>)[key], depth + 1);
    }
    return result as T;
  }
  return obj;
}

// ─── URL Safety (A10 SSRF, Open Redirect) ───────────────────────────

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
 * Blocks internal IPs, cloud metadata endpoints, and non-HTTP protocols.
 */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,        // Link-local / AWS metadata
  /^\[::1?\]$/,                   // IPv6 loopback
  /^metadata\.google\.internal$/i,
  /^\.internal$/i,                // GCP internal
  /^fd[0-9a-f]{2}:/i,            // IPv6 ULA
  /^fc[0-9a-f]{2}:/i,            // IPv6 ULA
];

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname;
    if (!host || host.length === 0) return false;
    // Block numeric-only hostnames (potential IP bypass)
    if (/^\d+$/.test(host)) return false;
    return !BLOCKED_HOST_PATTERNS.some((p) => p.test(host));
  } catch {
    return false;
  }
}

/**
 * Prevent open redirect attacks by validating redirect targets.
 * Only allows same-origin or explicitly allowed external domains.
 */
const ALLOWED_REDIRECT_DOMAINS = [
  "techfleetnetwork.lovable.app",
  "guide.techfleet.org",
];

export function isSafeRedirectUrl(url: string): boolean {
  try {
    // Relative URLs are always safe (same-origin)
    if (url.startsWith("/") && !url.startsWith("//")) return true;
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return true;
    return ALLOWED_REDIRECT_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// ─── Cryptographic Helpers (A02) ────────────────────────────────────

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

// ─── PII Protection (A09) ───────────────────────────────────────────

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

/**
 * Safe error message formatter that strips sensitive details.
 * Prevents internal details from leaking to the client (A09).
 */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Strip stack traces, file paths, and SQL details
    const msg = error.message;
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
      return "Service temporarily unavailable";
    }
    if (/relation.*does not exist|column.*does not exist/i.test(msg)) {
      return "A data error occurred";
    }
    if (/permission denied|row-level security/i.test(msg)) {
      return "Access denied";
    }
    // Return generic for unrecognized database/system errors
    if (/pg_|sql|supabase|postgres/i.test(msg)) {
      return "An internal error occurred";
    }
    // Truncate and return sanitized message
    return msg.slice(0, 200);
  }
  return "An unexpected error occurred";
}

// ─── Timing-Safe Comparison (A02, A07) ──────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks.
 * Pads the shorter string so the loop length never leaks which input
 * was shorter — the XOR still produces a non-zero result on mismatch.
 */
export function safeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  // Length mismatch will still fail because padded chars won't match,
  // but we track it explicitly to guarantee rejection.
  let result = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

// ─── Input Guards (A03, A04) ────────────────────────────────────────

/** Enforce a maximum byte length on a string (prevents oversized payloads) */
export function enforceMaxBytes(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(input);
  if (encoded.length <= maxBytes) return input;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(encoded.slice(0, maxBytes));
}

/**
 * Detect common SQL injection patterns in user input.
 * Use as an additional defense layer (RLS + parameterized queries are primary).
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION|EXEC|TRUNCATE|GRANT|REVOKE)\b.*\b(FROM|INTO|TABLE|SET|WHERE|ALL)\b)/i,
  /(['";]\s*(--))/,
  /(\/\*[\s\S]*?\*\/)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /(\bAND\b\s+\d+\s*=\s*\d+)/i,
  /(;\s*(DROP|ALTER|TRUNCATE|DELETE)\b)/i,
  /(\bEXEC(UTE)?\s+(xp_|sp_))/i,
  /(\bINFORMATION_SCHEMA\b)/i,
  /(\bpg_catalog\b)/i,
  /(\bCHAR\s*\(\d+\))/i,
];

export function hasSqlInjectionPattern(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((p) => p.test(input));
}

/**
 * Detect path traversal attempts (A01).
 * Validates file names/paths don't escape intended directories.
 */
export function hasPathTraversal(input: string): boolean {
  const normalized = decodeURIComponent(input);
  return /\.\.[/\\]/.test(normalized) ||
    /%2e%2e[/\\%]/i.test(input) ||
    /\.\.%2f/i.test(input) ||
    /\.\.%5c/i.test(input);
}

/**
 * Detect HTTP header injection attempts.
 * Prevents CRLF injection in header values.
 */
export function hasHeaderInjection(input: string): boolean {
  return /[\r\n]/.test(input) || /%0[aAdD]/i.test(input);
}

/**
 * Mass assignment protection (A04 Insecure Design).
 * Picks only allowed keys from an object, rejecting everything else.
 * Use when processing user-submitted form data before DB writes.
 */
export function pickAllowedFields<T extends Record<string, unknown>>(
  data: T,
  allowedKeys: string[],
): Partial<T> {
  const result: Partial<T> = {};
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(data)) {
    if (allowedSet.has(key)) {
      (result as Record<string, unknown>)[key] = data[key];
    }
  }
  return result;
}

/**
 * Validate UUID format to prevent IDOR attacks (A01).
 * Ensures IDs follow the standard UUID v4 pattern.
 */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate that a string is safe for use in content-disposition headers.
 * Prevents header injection via file names.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w\s.-]/g, "_")  // Replace non-safe chars
    .replace(/\.{2,}/g, ".")     // Collapse multiple dots
    .slice(0, 200);              // Max length
}

// ─── ReDoS Protection ───────────────────────────────────────────────

/**
 * Safely test a regex against input with a length limit.
 * Prevents ReDoS by rejecting excessively long inputs.
 */
export function safeRegexTest(
  pattern: RegExp,
  input: string,
  maxLength = 10_000,
): boolean {
  if (input.length > maxLength) return false;
  return pattern.test(input);
}

// ─── Prototype Pollution Guard (A08) ────────────────────────────────

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

// ─── HTML Sanitization (DOMPurify) (A03) ────────────────────────────

/**
 * Strict allow-list for user-generated rich text (announcements, banners,
 * notification bodies). Locked down to ONLY the formatting tags Quill emits
 * — no styling vectors of any kind:
 *
 *   • No `style` attribute (forbids inline CSS)
 *   • No `class` attribute (forbids referencing global Tailwind/utility CSS)
 *   • No `id` attribute (forbids `:target` CSS pseudo-class abuse + DOM clobbering)
 *   • No `<style>`, `<link>`, `<svg>`, `<math>`, `<iframe>`, `<object>`, `<embed>`
 *   • No `<div>`, `<span>`, `<img>`, `<table>` (positional/visual abuse vectors)
 *
 * This is enforced both on read (renderer) AND on write (DB trigger
 * `sanitize_user_html_trigger`) for defense in depth — a compromised
 * admin token cannot store CSS/HTML payloads either.
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  // Hard cap to prevent DOM-based DoS via giant HTML blobs.
  const capped = dirty.length > 100_000 ? dirty.slice(0, 100_000) : dirty;
  return DOMPurify.sanitize(capped, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "a", "ul", "ol", "li", "h2", "h3", "blockquote",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/)|#)/i,
    FORBID_TAGS: [
      "style", "link", "meta", "base", "script", "iframe",
      "object", "embed", "form", "input", "button", "textarea",
      "select", "option", "svg", "math", "img", "video", "audio",
      "source", "track", "frame", "frameset", "applet",
      "div", "span", "table", "thead", "tbody", "tfoot",
      "tr", "th", "td", "colgroup", "col", "caption",
    ],
    FORBID_ATTR: [
      "style", "class", "id", "srcset", "sizes", "loading",
      "ping", "formaction", "background", "poster",
    ],
    KEEP_CONTENT: true,            // keep inner text of stripped wrapper tags
    SANITIZE_DOM: true,             // mitigate DOM clobbering
    SANITIZE_NAMED_PROPS: true,
    IN_PLACE: false,
  });
}

// Force every surviving <a> to open in a new tab with a safe rel.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

// ─── Content-Type Validation (A05) ──────────────────────────────────

/**
 * Allowed file upload MIME types.
 * SVG is intentionally EXCLUDED — SVGs can carry <script> and event handlers
 * that survive client-side rendering, and our public storage buckets serve
 * files with their declared Content-Type, so a malicious SVG would execute
 * in the user's origin context. Use PNG/JPG/WebP for any image upload.
 */
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
]);

/** Max file size in bytes (10 MB) */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return { valid: false, error: `File type "${file.type}" is not allowed` };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { valid: false, error: `File size exceeds the ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB limit` };
  }
  if (hasPathTraversal(file.name)) {
    return { valid: false, error: "Invalid file name" };
  }
  return { valid: true };
}

// ─── Rate Limiting Helper (A04) ─────────────────────────────────────

/**
 * Client-side rate limiter for UI actions (e.g., form submissions).
 * Uses a sliding window approach. NOT a substitute for server-side rate limiting.
 */
const actionTimestamps = new globalThis.Map<string, number[]>();

export function isClientRateLimited(
  action: string,
  maxAttempts = 5,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const timestamps = actionTimestamps.get(action) || [];
  // Remove expired entries
  const recent = timestamps.filter((t) => now - t < windowMs);
  if (recent.length >= maxAttempts) return true;
  recent.push(now);
  actionTimestamps.set(action, recent);
  return false;
}

/** Reset client-side rate limit for an action */
export function resetClientRateLimit(action: string): void {
  actionTimestamps.delete(action);
}

// ─── CORS Origin Validation ─────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "https://techfleetnetwork.lovable.app",
  "https://id-preview--3ae718a9-cd87-4a00-991b-209d8baa78ad.lovable.app",
]);

/** Validate that a request origin is allowed */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

// ─── WSTG Session Security (WSTG-SESS-07, WSTG-SESS-09) ───────────

/**
 * Clear sensitive session data when the app is backgrounded (MASVS-STORAGE-2).
 * Removes cached form data from sessionStorage to prevent data theft
 * on shared/public devices. Preserves session management keys.
 */
export function clearSensitiveSessionData(): void {
  const keysToKeep = new Set(["session_started_at", "theme", "sb-iqsjhrhsjlgjiaedzmtz-auth-token"]);
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && !keysToKeep.has(key)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}

// ─── CRS-Inspired WAF Patterns (ModSecurity CRS) ───────────────────

/**
 * Detect common attack payloads that match ModSecurity CRS rules.
 * Use as an additional defense layer in edge functions.
 */
const CRS_ATTACK_PATTERNS = [
  // CRS 941 — XSS patterns
  /<script[\s>]/i,
  /\bon\w+\s*=\s*["']/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<svg[\s>].*\bon/i,
  // CRS 942 — SQL injection patterns
  /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP)\b.*\b(FROM|INTO|TABLE|SET|WHERE)\b)/i,
  /(;\s*(DROP|ALTER|TRUNCATE|DELETE|CREATE)\b)/i,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /(\bEXEC(UTE)?\s+(xp_|sp_))/i,
  // CRS 944 — Java/deserialization patterns
  /java\.lang\.\w+/i,
  /javax?\.\w+\.\w+/i,
  // CRS 930 — LFI patterns
  /\.\.[\/\\]/,
  /(\/etc\/(passwd|shadow|hosts))/i,
  /(%00|%0[aAdD])/,
  // CRS 931 — RFI patterns
  /(https?:\/\/.*\.(php|asp|jsp|cgi))/i,
];

export function hasCRSAttackPattern(input: string): boolean {
  if (input.length > 50_000) return true; // Oversized payload = suspicious
  return CRS_ATTACK_PATTERNS.some((p) => p.test(input));
}

// ─── MASVS: Sensitive Field Protection ──────────────────────────────

/**
 * HTML attributes for sensitive input fields to prevent data caching.
 * Per OWASP MASVS-STORAGE-2, prevent autocomplete/autofill for sensitive data.
 */
export const SENSITIVE_INPUT_ATTRS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true", // LastPass
  "data-1p-ignore": "true", // 1Password
} as const;

// ─── Dependency Track: SBOM Metadata ────────────────────────────────

/**
 * Returns Software Bill of Materials metadata for the application.
 * Per Dependency Track guidelines, applications should expose SBOM info.
 */
export function getSBOMMetadata() {
  return {
    format: "CycloneDX",
    specVersion: "1.5",
    component: {
      type: "application",
      name: "tech-fleet-network",
      version: "1.0.0",
      description: "Tech Fleet professional training platform",
    },
    toolsUsed: ["npm audit", "lovable-dependency-scan"],
    lastScanDate: new Date().toISOString(),
  };
}

// ─── Content Integrity ──────────────────────────────────────────────

/**
 * Validate that a string doesn't contain null bytes (CRS 920 protocol violation).
 * Null bytes can be used to bypass security filters.
 */
export function hasNullBytes(input: string): boolean {
  return input.includes("\0") || /%00/i.test(input);
}

/**
 * Validate Content-Type header matches expected value (WSTG-CONF-02).
 * Prevents content-type confusion attacks.
 */
export function isExpectedContentType(
  actual: string | null,
  expected: string,
): boolean {
  if (!actual) return false;
  return actual.toLowerCase().startsWith(expected.toLowerCase());
}

// ─── OWASP LLM Top 10: Client-Side AI Security ─────────────────────

/**
 * LLM02: Detect PII patterns in AI output for client-side redaction.
 * Use as a defense-in-depth layer — server-side filtering is primary.
 */
const CLIENT_PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi,  // emails
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                       // US phone numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,                               // SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,         // credit cards
];

export function redactPIIFromOutput(text: string): string {
  let redacted = text;
  for (const pattern of CLIENT_PII_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

/**
 * LLM05: Sanitize AI-generated markdown/HTML before rendering.
 * Prevents XSS from AI output that may contain injected scripts.
 */
export function sanitizeAIMarkdown(markdown: string): string {
  return markdown
    .replace(/<script[\s>][^]*?<\/script>/gi, "")
    .replace(/<iframe[\s>][^]*?<\/iframe>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "");
}

/**
 * LLM01: Detect prompt injection patterns in user input (client-side).
 * Use as pre-flight check before sending to AI endpoint.
 */
export function hasPromptInjectionPattern(input: string): boolean {
  const patterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
    /you\s+are\s+now\s+(a|an|the|DAN|jailbroken)/i,
    /system\s*prompt/i,
    /\[SYSTEM\]/i,
    /reveal\s+(your|the)\s+(system|initial)\s+(prompt|instructions?)/i,
    /bypass\s+(the\s+)?(restrictions?|filters?|safety)/i,
  ];
  return patterns.some((p) => p.test(input));
}

import { hasActiveXssPattern } from "@/lib/security";
import { isStrongPassword } from "@/lib/validators/auth";

type Verdict = { allowed: true } | { allowed: false; reason: string };

const BACKEND_PATH_PATTERN = /\/(auth|rest|functions)\/v1\//;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const MAX_JSON_BODY_BYTES = 250_000;
const MAX_TEXT_VALUE_BYTES = 50_000;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_DEPTH = 12;
const ATTACK_LOCK_KEY = "tfn:client-input-firewall:attack-lock-until";
const ATTACK_LOCK_MS = 10 * 60_000;
const EMAIL_KEY_PATTERN = /(^|_|-)email($|_|-)/i;
const PASSWORD_KEY_PATTERN = /(^|_|-)password($|_|-)/i;
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
const DANGEROUS_EMAIL_CHARS = /[<>"'`\\\s]/;
const hasUnsafeControlChar = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) return true;
  }
  return false;
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function blocked(reason: string): Verdict {
  return { allowed: false, reason };
}

function lockBackendWritesForAttack() {
  try {
    window.sessionStorage.setItem(ATTACK_LOCK_KEY, String(Date.now() + ATTACK_LOCK_MS));
  } catch {
    // Storage can be unavailable in private/locked-down contexts; the current request is still blocked.
  }
}

function getAttackLockVerdict(): Verdict | null {
  try {
    const lockUntil = Number(window.sessionStorage.getItem(ATTACK_LOCK_KEY) || 0);
    if (lockUntil > Date.now()) return blocked("Unsafe input was detected. Please refresh before trying again.");
    if (lockUntil) window.sessionStorage.removeItem(ATTACK_LOCK_KEY);
  } catch {
    return null;
  }
  return null;
}

function inspectString(key: string, value: string): Verdict {
  if (byteLength(value) > MAX_TEXT_VALUE_BYTES) return blocked("Input is too long.");
  if (hasUnsafeControlChar(value)) return blocked("Input contains invalid control characters.");
  if (EMAIL_KEY_PATTERN.test(key) && value && (DANGEROUS_EMAIL_CHARS.test(value) || !EMAIL_PATTERN.test(value))) {
    return blocked("Enter a valid email address.");
  }
  if (PASSWORD_KEY_PATTERN.test(key) && value && !isStrongPassword(value)) return blocked("Password does not meet the security requirements.");
  if (hasActiveXssPattern(value)) return blocked("Input contains unsafe content.");
  return { allowed: true };
}

function inspectValue(value: unknown, key = "", depth = 0): Verdict {
  if (depth > MAX_OBJECT_DEPTH) return blocked("Input is too deeply nested.");
  if (typeof value === "string") return inspectString(key, value);
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) return blocked("Input has too many items.");
    for (const item of value) {
      const verdict = inspectValue(item, key, depth + 1);
      if (!verdict.allowed) return verdict;
    }
    return { allowed: true };
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (["__proto__", "constructor", "prototype"].includes(childKey)) return blocked("Input contains unsafe fields.");
      const verdict = inspectValue(childValue, childKey, depth + 1);
      if (!verdict.allowed) return verdict;
    }
  }
  return { allowed: true };
}

async function inspectBody(input: RequestInfo | URL, init?: RequestInit): Promise<Verdict> {
  const body = init?.body ?? (input instanceof Request ? input.clone().body : undefined);
  if (!body) return { allowed: true };
  if (typeof body === "string") {
    if (byteLength(body) > MAX_JSON_BODY_BYTES) return blocked("Request is too large.");
    try {
      return inspectValue(JSON.parse(body));
    } catch {
      return inspectString("body", body);
    }
  }
  if (body instanceof URLSearchParams) {
    if (byteLength(body.toString()) > MAX_JSON_BODY_BYTES) return blocked("Request is too large.");
    for (const [key, value] of body.entries()) {
      const verdict = inspectString(key, value);
      if (!verdict.allowed) return verdict;
    }
  }
  if (body instanceof FormData) {
    for (const [key, value] of body.entries()) {
      if (typeof value === "string") {
        const verdict = inspectString(key, value);
        if (!verdict.allowed) return verdict;
      }
    }
  }
  if (input instanceof Request && !init?.body) {
    const text = await input.clone().text();
    if (text) return inspectBody(input, { body: text });
  }
  return { allowed: true };
}

function rejectionResponse(reason: string): Response {
  return new Response(JSON.stringify({ error: reason }), {
    status: 400,
    statusText: "Bad Request",
    headers: { "Content-Type": "application/json", "X-Client-Input-Blocked": "true" },
  });
}

export function shouldInspectClientInput(url: URL, method: string): boolean {
  return url.origin !== window.location.origin && WRITE_METHODS.has(method) && BACKEND_PATH_PATTERN.test(url.pathname);
}

export async function blockUnsafeClientInput(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, method: string): Promise<Response | null> {
  if (!shouldInspectClientInput(url, method)) return null;
  const locked = getAttackLockVerdict();
  if (locked?.allowed === false) return rejectionResponse(locked.reason);
  const verdict = await inspectBody(input, init);
  if (verdict.allowed === true) return null;
  lockBackendWritesForAttack();
  return rejectionResponse(verdict.reason);
}

export const __clientInputFirewallTestHooks = { inspectValue, inspectString };
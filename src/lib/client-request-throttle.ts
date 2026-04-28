import { blockUnsafeClientInput } from "@/lib/client-input-firewall";
import { hasFreshLoginCaptchaVerification, isLoginCaptchaRequired } from "@/lib/auth-captcha";
import { formatAuthLockoutMessage, getAuthLockoutState } from "@/lib/auth-lockout";
import { logCaptchaTelemetry } from "@/lib/auth-captcha-telemetry";
import { hasFreshOAuthUiMarker } from "@/lib/oauth-ui-guard";
import { AUTH_THROTTLE_CAPTCHA_CODE, AUTH_THROTTLE_CAPTCHA_MESSAGE } from "@/lib/auth-throttle-captcha";

const BACKEND_PATH_PATTERN = /\/(auth|rest|functions)\/v1\//;
const STATIC_ASSET_PATTERN = /\.(?:js|css|map|json|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|pdf)$/i;

const WINDOW_MS = 60_000;
const MAX_IDENTICAL_REQUESTS = 5;
const CLEANUP_AFTER_MS = WINDOW_MS * 2;
const AUTH_ATTEMPT_WINDOW_MS = 60_000;
const MAX_AUTH_ATTEMPTS_PER_WINDOW = 3;
const AUTH_ATTEMPT_BUCKET_KEY = "tfn:client-auth-attempt-window";
const AUTH_ATTEMPT_PATH_PATTERN = /\/(auth\/v1\/(token|signup|recover|otp|resend)|rest\/v1\/rpc\/check_rate_limit)$/;
const PASSKEY_SECURITY_PATH_PATTERN = /\/(functions\/v1\/(passkey-auth-options|passkey-auth-verify|device-prove|device-bind|passkey-recovery-request|passkey-recovery-verify)|rest\/v1\/(rpc\/is_trusted_device_active|passkey_credentials))$/;
const PUBLIC_AGGREGATE_READ_PATH_PATTERN = /\/rest\/v1\/rpc\/get_network_stats$/;
const RATE_LIMIT_LOG_DEDUPE_MS = 30_000;
const rateLimitLogDedupe = new Map<string, number>();

type Bucket = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

const buckets = new Map<string, Bucket>();

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input && input.method) return input.method.toUpperCase();
  return "GET";
}

function shouldThrottle(url: URL): boolean {
  if (url.origin === window.location.origin) return false;
  if (STATIC_ASSET_PATTERN.test(url.pathname)) return false;
  if (PASSKEY_SECURITY_PATH_PATTERN.test(url.pathname)) return false;
  if (PUBLIC_AGGREGATE_READ_PATH_PATTERN.test(url.pathname)) return false;
  return BACKEND_PATH_PATTERN.test(url.pathname);
}

function bucketKey(url: URL, method: string): string {
  url.searchParams.sort();
  return `${window.location.origin}|${url.origin}|${method}|${url.pathname}|${url.search}`;
}

function consumeBucket(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  for (const [bucketKeyValue, bucket] of buckets) {
    if (now - bucket.lastSeenAt > CLEANUP_AFTER_MS) buckets.delete(bucketKeyValue);
  }

  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS, lastSeenAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  current.lastSeenAt = now;

  if (current.count > MAX_IDENTICAL_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function consumeAuthAttemptBucket(now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  try {
    const raw = window.sessionStorage.getItem(AUTH_ATTEMPT_BUCKET_KEY);
    const current = raw ? (JSON.parse(raw) as Partial<Bucket>) : null;
    if (!current?.resetAt || !current?.count || now >= current.resetAt) {
      window.sessionStorage.setItem(AUTH_ATTEMPT_BUCKET_KEY, JSON.stringify({ count: 1, resetAt: now + AUTH_ATTEMPT_WINDOW_MS, lastSeenAt: now }));
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const next = { count: current.count + 1, resetAt: current.resetAt, lastSeenAt: now };
    window.sessionStorage.setItem(AUTH_ATTEMPT_BUCKET_KEY, JSON.stringify(next));
    if (next.count > MAX_AUTH_ATTEMPTS_PER_WINDOW) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - now) / 1000)) };
    }
  } catch {
    return consumeBucket(`${window.location.origin}|auth-attempts`, now);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function rateLimitedResponse(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "Too many rapid requests. Please wait before trying again." }), {
    status: 429,
    statusText: "Too Many Requests",
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
      "X-Client-Rate-Limited": "true",
    },
  });
}

function authThrottleCaptchaResponse(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: AUTH_THROTTLE_CAPTCHA_MESSAGE, code: AUTH_THROTTLE_CAPTCHA_CODE }), {
    status: 429,
    statusText: "Too Many Requests",
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
      "X-Client-Rate-Limited": "true",
      "X-Client-Captcha-Required": "true",
    },
  });
}

function localLockoutResponse(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: formatAuthLockoutMessage(retryAfterSeconds) }), {
    status: 429,
    statusText: "Too Many Requests",
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
      "X-Client-Auth-Lockout": "true",
    },
  });
}

function captchaRequiredResponse(): Response {
  return new Response(JSON.stringify({ error: "Complete the human verification before trying again." }), {
    status: 403,
    statusText: "Forbidden",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Captcha-Required": "true",
    },
  });
}

function isAuthAttemptRequest(url: URL, method: string): boolean {
  return method === "POST" && url.origin !== window.location.origin && AUTH_ATTEMPT_PATH_PATTERN.test(url.pathname);
}

function logClientRateLimitHit(
  originalFetch: typeof window.fetch,
  url: URL,
  method: string,
  reason: "auth_lockout" | "auth_throttle_captcha" | "request_throttle",
  retryAfterSeconds: number,
) {
  const now = Date.now();
  const dedupeKey = `${reason}:${method}:${url.pathname}`;
  const lastLoggedAt = rateLimitLogDedupe.get(dedupeKey) ?? 0;
  if (now - lastLoggedAt < RATE_LIMIT_LOG_DEDUPE_MS) return;
  rateLimitLogDedupe.set(dedupeKey, now);

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-rate-limit-log`;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!endpoint || !publishableKey) return;

  void originalFetch(endpoint, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
    },
    body: JSON.stringify({
      reason,
      method,
      path: url.pathname,
      retryAfterSeconds,
      captchaRequired: reason === "auth_throttle_captcha",
      surface: "fetch_interceptor",
    }),
  }).catch(() => undefined);
}

export function installClientRequestThrottle() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;

  const globalWindow = window as Window & { __techFleetRequestThrottleInstalled?: boolean };
  if (globalWindow.__techFleetRequestThrottleInstalled) return;
  globalWindow.__techFleetRequestThrottleInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl = getRequestUrl(input);
      const url = new URL(rawUrl, window.location.href);
      const method = getRequestMethod(input, init);

      const unsafeInputResponse = await blockUnsafeClientInput(input, init, url, method);
      if (unsafeInputResponse) return unsafeInputResponse;

      if (shouldThrottle(url)) {
        if (isAuthAttemptRequest(url, method)) {
          const lockout = getAuthLockoutState();
          if (lockout.locked) {
            logClientRateLimitHit(originalFetch, url, method, "auth_lockout", lockout.remainingSeconds);
            return localLockoutResponse(lockout.remainingSeconds);
          }

          const hasFreshCaptcha = hasFreshLoginCaptchaVerification() || hasFreshOAuthUiMarker();
          if (isLoginCaptchaRequired() && !hasFreshCaptcha) {
            logCaptchaTelemetry("auth_captcha_fetch_blocked", { surface: "fetch_interceptor", authPath: url.pathname });
            return captchaRequiredResponse();
          }

          const authResult = consumeAuthAttemptBucket();
          if (!authResult.allowed && !hasFreshCaptcha) {
            logClientRateLimitHit(originalFetch, url, method, "auth_throttle_captcha", authResult.retryAfterSeconds);
            return authThrottleCaptchaResponse(authResult.retryAfterSeconds);
          }
        }

        const result = consumeBucket(bucketKey(url, method));
        if (!result.allowed) {
          logClientRateLimitHit(originalFetch, url, method, "request_throttle", result.retryAfterSeconds);
          return rateLimitedResponse(result.retryAfterSeconds);
        }
      }
    } catch {
      // If URL parsing fails, preserve native fetch behavior instead of blocking legitimate requests.
    }

    return originalFetch(input, init);
  };
}

export const __clientRequestThrottleTestHooks = {
  buckets,
  consumeBucket,
  shouldThrottle,
  logClientRateLimitHit,
  rateLimitLogDedupe,
};
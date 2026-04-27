const BACKEND_PATH_PATTERN = /\/(auth|rest|functions)\/v1\//;
const STATIC_ASSET_PATTERN = /\.(?:js|css|map|json|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|pdf)$/i;

const WINDOW_MS = 60_000;
const MAX_IDENTICAL_REQUESTS = 5;
const CLEANUP_AFTER_MS = WINDOW_MS * 2;

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

      if (shouldThrottle(url)) {
        const result = consumeBucket(bucketKey(url, method));
        if (!result.allowed) return rateLimitedResponse(result.retryAfterSeconds);
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
};
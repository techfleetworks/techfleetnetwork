import { describe, expect, it, vi } from "vitest";
import { __clientRequestThrottleTestHooks } from "@/lib/client-request-throttle";

describe("client request throttle (BDD SECURITY-CLIENT-THROTTLE-001)", () => {
  it("blocks the sixth identical backend request within one minute", () => {
    const key = "https://techfleet.network|https://backend.example|POST|/functions/v1/techfleet-chat|";
    __clientRequestThrottleTestHooks.buckets.clear();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(__clientRequestThrottleTestHooks.consumeBucket(key, 1_000).allowed).toBe(true);
    }

    const blocked = __clientRequestThrottleTestHooks.consumeBucket(key, 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("allows the same request again after the throttle window resets", () => {
    const key = "https://techfleet.network|https://backend.example|GET|/rest/v1/profiles|?select=id";
    __clientRequestThrottleTestHooks.buckets.clear();

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      __clientRequestThrottleTestHooks.consumeBucket(key, 2_000);
    }

    expect(__clientRequestThrottleTestHooks.consumeBucket(key, 63_000).allowed).toBe(true);
  });

  it("does not throttle passkey security verification requests", () => {
    expect(__clientRequestThrottleTestHooks.shouldThrottle(new URL("https://backend.example/rest/v1/rpc/is_trusted_device_active"))).toBe(false);
    expect(__clientRequestThrottleTestHooks.shouldThrottle(new URL("https://backend.example/rest/v1/passkey_credentials"))).toBe(false);
    expect(__clientRequestThrottleTestHooks.shouldThrottle(new URL("https://backend.example/functions/v1/passkey-auth-verify"))).toBe(false);
    expect(__clientRequestThrottleTestHooks.shouldThrottle(new URL("https://backend.example/functions/v1/device-prove"))).toBe(false);
  });

  it("does not throttle the public aggregate Network Activity stats endpoint", () => {
    expect(__clientRequestThrottleTestHooks.shouldThrottle(new URL("https://backend.example/rest/v1/rpc/get_network_stats"))).toBe(false);
  });

  it("deduplicates privacy-safe Cloud log events for throttle hits", async () => {
    const originalFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const url = new URL("https://backend.example/auth/v1/token?grant_type=password&email=private@example.com");
    __clientRequestThrottleTestHooks.rateLimitLogDedupe.clear();

    __clientRequestThrottleTestHooks.logClientRateLimitHit(originalFetch as unknown as typeof fetch, url, "POST", "auth_throttle_captcha", 45);
    __clientRequestThrottleTestHooks.logClientRateLimitHit(originalFetch as unknown as typeof fetch, url, "POST", "auth_throttle_captcha", 45);

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((originalFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ reason: "auth_throttle_captcha", method: "POST", path: "/auth/v1/token", retryAfterSeconds: 45 });
    expect(JSON.stringify(body)).not.toContain("private@example.com");
    expect(JSON.stringify(body)).not.toContain("grant_type");
  });
});
import { describe, expect, it } from "vitest";
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
});
import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseClientRateLimitLogPayload } from "./validation.ts";

Deno.test("parseClientRateLimitLogPayload rejects non-object payloads", () => {
  assertInstanceOf(parseClientRateLimitLogPayload(null), Response);
  assertInstanceOf(parseClientRateLimitLogPayload([]), Response);
});

Deno.test("parseClientRateLimitLogPayload redacts unsafe telemetry fields", () => {
  const parsed = parseClientRateLimitLogPayload({
    reason: "unknown_reason",
    method: "TRACE",
    path: "/private/admin/users?email=member@example.com",
    retryAfterSeconds: 9999999,
    captchaRequired: true,
    surface: "<script>alert(1)</script>",
  });

  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.reason, "request_throttle");
  assertEquals(parsed.method, "UNKNOWN");
  assertEquals(parsed.path, "/redacted");
  assertEquals(parsed.retryAfterSeconds, 86_400);
  assertEquals(parsed.captchaRequired, true);
  assertEquals(parsed.surface, "unknown");
});

Deno.test("parseClientRateLimitLogPayload preserves safe telemetry fields", () => {
  const parsed = parseClientRateLimitLogPayload({
    reason: "auth_throttle_captcha",
    method: "post",
    path: "/auth/v1/token",
    retryAfterSeconds: 45.7,
    captchaRequired: true,
    surface: "fetch_interceptor",
  });

  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.reason, "auth_throttle_captcha");
  assertEquals(parsed.method, "POST");
  assertEquals(parsed.path, "/auth/v1/token");
  assertEquals(parsed.retryAfterSeconds, 46);
  assertEquals(parsed.surface, "fetch_interceptor");
});

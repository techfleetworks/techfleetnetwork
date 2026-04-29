import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseRateLimitRequest } from "./validation.ts";

Deno.test("parseRateLimitRequest rejects malformed auth throttling payloads", () => {
  assertInstanceOf(parseRateLimitRequest(null), Response);
  assertInstanceOf(parseRateLimitRequest({ identifier: "", action: "login_attempt" }), Response);
  assertInstanceOf(parseRateLimitRequest({ identifier: "<script>alert(1)</script>", action: "login_attempt" }), Response);
  assertInstanceOf(parseRateLimitRequest({ identifier: "user@example.com", action: "admin_override" }), Response);
});

Deno.test("parseRateLimitRequest normalizes safe identifiers and whitelisted actions", () => {
  const parsed = parseRateLimitRequest({ identifier: " User@Example.COM ", action: "login_attempt" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.identifier, "user@example.com");
  assertEquals(parsed.action, "login_attempt");
});

Deno.test("parseRateLimitRequest accepts pre-hashed identifiers for privacy-preserving clients", () => {
  const hash = "a".repeat(64);
  const parsed = parseRateLimitRequest({ identifier: hash, action: "password_reset" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.identifier, hash);
  assertEquals(parsed.action, "password_reset");
});

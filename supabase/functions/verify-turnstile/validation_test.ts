import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTurnstileProviderSuccess, parseTurnstileVerificationRequest, sanitizeTurnstileErrorCodes } from "./validation.ts";

Deno.test("parseTurnstileVerificationRequest rejects malformed public verification payloads", () => {
  assertInstanceOf(parseTurnstileVerificationRequest(null), Response);
  assertInstanceOf(parseTurnstileVerificationRequest({ token: "short", action: "login" }), Response);
  assertInstanceOf(parseTurnstileVerificationRequest({ token: "x".repeat(20), action: "admin_bypass" }), Response);
  assertInstanceOf(parseTurnstileVerificationRequest({ token: "x".repeat(20) + "<script>", action: "login" }), Response);

  const parsed = parseTurnstileVerificationRequest({ token: ` ${"a".repeat(32)} `, action: "register" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.token, "a".repeat(32));
  assertEquals(parsed.action, "register");
});

Deno.test("Turnstile provider helpers sanitize errors and enforce action binding", () => {
  assertEquals(sanitizeTurnstileErrorCodes(["timeout-or-duplicate", "leaked@example.com", "internal-error"]), ["timeout-or-duplicate", "internal-error"]);
  assertEquals(isTurnstileProviderSuccess({ success: true, action: "login" }, "login"), true);
  assertEquals(isTurnstileProviderSuccess({ success: true, action: "register" }, "login"), false);
  assertEquals(isTurnstileProviderSuccess({ success: false }, "login"), false);
});

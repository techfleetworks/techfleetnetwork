import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeRevocationUsers, toSafeSignOutFailures } from "./validation.ts";

Deno.test("normalizeRevocationUsers keeps unique valid auth user identifiers only", () => {
  assertEquals(normalizeRevocationUsers([
    { id: "123E4567-E89B-42D3-A456-426614174000", email: "redacted@example.com" },
    { id: "123e4567-e89b-42d3-a456-426614174000" },
    { id: "../auth.users" },
    null,
  ]), [{ id: "123e4567-e89b-42d3-a456-426614174000" }]);
});

Deno.test("toSafeSignOutFailures removes raw provider messages from failure output", () => {
  assertEquals(toSafeSignOutFailures([
    { user_id: "123e4567-e89b-42d3-a456-426614174000", error: "user@example.com token failed with 429" },
    { user_id: "223e4567-e89b-42d3-a456-426614174000", error: "database secret stack trace" },
  ]), [
    { user_id: "123e4567-e89b-42d3-a456-426614174000", code: "rate_limited" },
    { user_id: "223e4567-e89b-42d3-a456-426614174000", code: "provider_error" },
  ]);
});

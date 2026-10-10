// Unit tests for scrubSecretsOnly — the secrets-only DLP path used before sending
// raw content to a third-party observability sink (Braintrust, ADR-0073).
//
// CI: deno test supabase/functions/_shared/dlp.test.ts
// (must be listed in the .github/workflows/ci.yml deno-test allowlist to run).

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scrub, scrubSecretsOnly } from "./dlp.ts";

Deno.test("scrubSecretsOnly: strips credential classes", () => {
  const jwt = "eyJabcdefghij.eyJklmnopqrst.signaturesignature";
  const out = scrubSecretsOnly(`token ${jwt} and bearer Bearer abcdefghijklmnop123456`);
  assert(!out.includes("eyJabc"), "JWT must be redacted");
  assertStringIncludes(out, "[redacted-jwt]");
  assertStringIncludes(out, "Bearer [redacted-token]");
});

Deno.test("scrubSecretsOnly: strips credit-card-like digit runs, keeps surrounding text", () => {
  const out = scrubSecretsOnly("card 4111 1111 1111 1111 on file");
  assertStringIncludes(out, "[redacted-cc]");
  assertStringIncludes(out, "card");
  assertStringIncludes(out, "on file");
});

Deno.test("scrubSecretsOnly: PRESERVES names, emails and UUIDs (raw-content fidelity)", () => {
  const uuid = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
  const input = `My name is Dana Lee, email dana@example.com, project ${uuid}`;
  const out = scrubSecretsOnly(input);
  assertStringIncludes(out, "Dana Lee", "names must be preserved");
  assertStringIncludes(out, "dana@example.com", "emails must be preserved in secrets-only mode");
  assertStringIncludes(out, uuid, "UUIDs must be preserved in secrets-only mode");
});

Deno.test("scrub (full) DOES redact emails/UUIDs — the difference secrets-only mode avoids", () => {
  const uuid = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
  const out = scrub(`email dana@example.com project ${uuid}`);
  assertStringIncludes(out, "[redacted-email]");
  assertStringIncludes(out, "[redacted-id]");
  assertEquals(out.includes("dana@example.com"), false);
});

Deno.test("scrubSecretsOnly: null-safe", () => {
  assertEquals(scrubSecretsOnly(""), "");
});

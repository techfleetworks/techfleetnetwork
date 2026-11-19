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
import { scrub, scrubSecretsOnly, scrubTree } from "./dlp.ts";

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

// ── scrubTree (public-access A4) ──────────────────────────────────────────────
// @security — proves scrubTree preserves URL/path fields (so storage hashes and
// tokens in hero_image_url/logo_url/registration_url are NOT corrupted) while
// still scrubbing free-text leaves and non-allowlisted ids. The discriminating
// pair (same hex under a URL key vs a non-URL key) proves the preservation is
// real, not vacuous.
const HEX_PATH = "a".repeat(48); // a ≥40-char hex token (storage hash shape)

Deno.test("scrubTree preserves a URL-valued key verbatim", () => {
  const out = scrubTree({
    hero_image_url: `https://cdn.example.com/${HEX_PATH}/cover.png`,
    logo_url: `https://cdn.example.com/${HEX_PATH}.svg`,
    registration_url: "https://gum.co/abcdef",
  });
  assertEquals(out.hero_image_url, `https://cdn.example.com/${HEX_PATH}/cover.png`);
  assertEquals(out.logo_url, `https://cdn.example.com/${HEX_PATH}.svg`);
  assertEquals(out.registration_url, "https://gum.co/abcdef");
});

Deno.test("DISCRIMINATING: preservation is key- AND value-shape-gated", () => {
  const realUrl = `https://cdn.example.com/${HEX_PATH}.png`;
  const out = scrubTree({
    hero_image_url: realUrl, // URL key + URL-shaped value → preserved
    logo_url: "mailto:contact@example.com", // URL key but NON-URL value → scrubbed (no bypass)
    website: "ping me at leak@example.com", // URL key but free text → scrubbed
    note: HEX_PATH, // non-URL key → scrubbed
  });
  assertEquals(out.hero_image_url, realUrl);
  assert(!out.logo_url.includes("contact@example.com"), "mailto email must be scrubbed");
  assert(!out.website.includes("leak@example.com"), "free-text email in a url key must be scrubbed");
  assert(out.website.includes("[redacted-email]"));
  assert(out.note !== HEX_PATH, "non-URL key must be scrubbed");
});

Deno.test("scrubTree redacts an email in a free-text leaf", () => {
  const out = scrubTree({ description: "Reach us at staff@example.com today" });
  assert(!out.description.includes("staff@example.com"));
  assert(out.description.includes("[redacted-email]"));
});

Deno.test("scrubTree scrubs nested objects and arrays", () => {
  const out = scrubTree({
    client: { name: "Email leak person@example.com", logo_url: `https://x/${HEX_PATH}.png` },
    deliverables: ["ok one", "mail me person@example.com"],
  });
  assert(!out.client.name.includes("person@example.com"));
  assertEquals(out.client.logo_url, `https://x/${HEX_PATH}.png`);
  assert(!out.deliverables[1].includes("person@example.com"));
  assertEquals(out.deliverables[0], "ok one");
});

Deno.test("scrubTree keeps allowlisted ids, redacts other ids", () => {
  // Realistic hex UUIDs (as gen_random_uuid produces). NOTE: a pathological
  // all-digit UUID would be clobbered by the credit-card regex in scrub()
  // before the UUID allowlist applies — a pre-existing scrub() limitation,
  // tracked as a follow-up; real hex ids are unaffected.
  const keepId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const otherId = "f9e8d7c6-b5a4-4321-9876-5a4b3c2d1e0f";
  const out = scrubTree(
    { id: keepId, note: `see ${otherId}` },
    { uuids: [keepId] },
  );
  assertEquals(out.id, keepId);
  assert(!out.note.includes(otherId));
  assert(out.note.includes("[redacted-id]"));
});

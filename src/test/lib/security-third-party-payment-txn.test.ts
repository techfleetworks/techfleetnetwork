// Mutation-climb batch 1 (CI-refactor): kill the surviving mutants in three security-critical
// helpers in src/lib/security.ts that previously had only happy-path coverage —
// isTrustedThirdPartyScriptUrl, isPaymentWebhookReplaySafe, isHighRiskTransactionAuthorized.
// Each `describe` exercises every branch and every boundary so a mutation (>= vs >, && vs ||,
// === vs !==, a dropped condition) changes an asserted outcome. Deterministic inputs only
// (explicit nowMs, no reliance on Date.now).
import { describe, it, expect } from "vitest";
import {
  isTrustedThirdPartyScriptUrl,
  isPaymentWebhookReplaySafe,
  isHighRiskTransactionAuthorized,
} from "@/lib/security";

describe("isTrustedThirdPartyScriptUrl — every branch", () => {
  it("rejects non-https even for a trusted host (protocol check)", () => {
    expect(isTrustedThirdPartyScriptUrl("http://js.stripe.com/v3")).toBe(false);
  });

  it("trusts any same-origin https script (short-circuits before the allowlist)", () => {
    // The same-origin branch only applies to https, so stub an https origin for this case
    // (the jsdom default origin is http, which the protocol check rejects first).
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "https://app.techfleet.network" },
    });
    try {
      expect(isTrustedThirdPartyScriptUrl("https://app.techfleet.network/assets/app.js")).toBe(true);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    }
  });

  it("rejects an untrusted cross-origin host even WITH a valid SRI hash (kills the allowlist guard)", () => {
    // A valid integrity is the only way this reaches a `true` if the host-allowlist guard were
    // dropped — so this is what actually proves the guard rejects untrusted hosts.
    expect(
      isTrustedThirdPartyScriptUrl("https://evil.example/app.js", "sha384-abcDEF123+/="),
    ).toBe(false);
    expect(isTrustedThirdPartyScriptUrl("https://evil.example/app.js")).toBe(false);
  });

  it("trusts js.stripe.com with no integrity (SRI-exempt provider)", () => {
    expect(isTrustedThirdPartyScriptUrl("https://js.stripe.com/v3")).toBe(true);
  });

  it("trusts challenges.cloudflare.com with no integrity (SRI-exempt provider)", () => {
    expect(
      isTrustedThirdPartyScriptUrl("https://challenges.cloudflare.com/turnstile/v0/api.js"),
    ).toBe(true);
  });

  it("trusts googletagmanager ONLY with a valid SRI hash", () => {
    expect(
      isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js", "sha384-abcDEF123+/="),
    ).toBe(true);
    expect(isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js", "sha256-Zm9v+/=")).toBe(
      true,
    );
  });

  it("rejects googletagmanager without integrity (undefined → not trusted)", () => {
    expect(isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js")).toBe(false);
  });

  it("rejects googletagmanager with an empty-string integrity (distinguishes && from ||)", () => {
    // typeof "" === "string" is true but the regex fails, so correct (&&) is false; an || mutant
    // would wrongly return true.
    expect(isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js", "")).toBe(false);
  });

  it("rejects googletagmanager with a non-SRI integrity string", () => {
    expect(isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js", "md5-deadbeef")).toBe(
      false,
    );
  });

  it("rejects SRI with leading junk before the hash (anchors the regex start — integrity bypass)", () => {
    // An unanchored ^ would match "...sha256-..." anywhere; a valid-looking suffix must not pass.
    expect(
      isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js", "junk-sha256-AAAA+/="),
    ).toBe(false);
  });

  it("rejects SRI with trailing junk after the hash (anchors the regex end — integrity bypass)", () => {
    // An unanchored $ would accept a valid prefix followed by arbitrary junk.
    expect(
      isTrustedThirdPartyScriptUrl("https://www.googletagmanager.com/gtm.js", "sha256-AAAA!!!"),
    ).toBe(false);
  });

  it("returns false on a malformed URL (catch path)", () => {
    expect(isTrustedThirdPartyScriptUrl("http://")).toBe(false);
  });
});

describe("isPaymentWebhookReplaySafe — every branch and boundary", () => {
  const base = { timestampMs: 1_000_000, nowMs: 1_000_000, idempotencyKey: "k".repeat(12) };

  it("accepts a fresh, in-window, unseen event", () => {
    expect(isPaymentWebhookReplaySafe({ ...base })).toBe(true);
  });

  it("rejects an empty idempotency key", () => {
    expect(isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "" })).toBe(false);
  });

  it("enforces the minimum key length boundary (11 reject, 12 accept)", () => {
    expect(isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "k".repeat(11) })).toBe(false);
    expect(isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "k".repeat(12) })).toBe(true);
  });

  it("enforces the maximum key length boundary (200 accept, 201 reject)", () => {
    expect(isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "k".repeat(200) })).toBe(true);
    expect(isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "k".repeat(201) })).toBe(false);
  });

  it("enforces the tolerance window boundary (exactly tolerance accept, +1 reject)", () => {
    const toleranceMs = 5 * 60 * 1000;
    expect(
      isPaymentWebhookReplaySafe({ ...base, timestampMs: 0, nowMs: toleranceMs, toleranceMs }),
    ).toBe(true);
    expect(
      isPaymentWebhookReplaySafe({ ...base, timestampMs: 0, nowMs: toleranceMs + 1, toleranceMs }),
    ).toBe(false);
  });

  it("applies the DEFAULT 5-minute tolerance when none is passed", () => {
    // Exercises the default param (5 * 60 * 1000) directly: a 100s-old event is within 5 min and must
    // be accepted. Catches a mutated default (e.g. 5/60) that would shrink the window to ~83ms.
    expect(isPaymentWebhookReplaySafe({ ...base, timestampMs: 0, nowMs: 100_000 })).toBe(true);
  });

  it("rejects a non-finite timestamp", () => {
    expect(isPaymentWebhookReplaySafe({ ...base, timestampMs: Number.NaN })).toBe(false);
  });

  it("rejects a replayed (already-seen) key and accepts an unseen one", () => {
    const seen = new Set(["seen-key-123456"]);
    expect(
      isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "seen-key-123456", seenIdempotencyKeys: seen }),
    ).toBe(false);
    expect(
      isPaymentWebhookReplaySafe({ ...base, idempotencyKey: "fresh-key-123456", seenIdempotencyKeys: seen }),
    ).toBe(true);
  });
});

describe("isHighRiskTransactionAuthorized — every branch and boundary", () => {
  const userId = "550e8400-e29b-41d4-a716-446655440000";
  const base = {
    actorUserId: userId,
    confirmationUserId: userId,
    action: "delete",
    resourceId: "r1",
    nonce: "nonce-1234567890",
  };

  it("authorizes a well-formed request", () => {
    expect(isHighRiskTransactionAuthorized({ ...base })).toBe(true);
  });

  it("rejects an invalid actor UUID", () => {
    expect(isHighRiskTransactionAuthorized({ ...base, actorUserId: "not-a-uuid" })).toBe(false);
  });

  it("rejects when confirmation user differs from actor (=== vs !==)", () => {
    expect(
      isHighRiskTransactionAuthorized({
        ...base,
        confirmationUserId: "660e8400-e29b-41d4-a716-446655440001",
      }),
    ).toBe(false);
  });

  it("rejects a missing action or resourceId", () => {
    expect(isHighRiskTransactionAuthorized({ ...base, action: "" })).toBe(false);
    expect(isHighRiskTransactionAuthorized({ ...base, resourceId: "" })).toBe(false);
  });

  it("enforces the nonce length boundary (15 reject, 16 accept)", () => {
    expect(isHighRiskTransactionAuthorized({ ...base, nonce: "x".repeat(15) })).toBe(false);
    expect(isHighRiskTransactionAuthorized({ ...base, nonce: "x".repeat(16) })).toBe(true);
  });

  it("rejects a replayed nonce", () => {
    expect(isHighRiskTransactionAuthorized({ ...base, replayedNonce: true })).toBe(false);
  });

  it("validates amountCents: undefined ok, 0 ok, negative and non-integer rejected", () => {
    expect(isHighRiskTransactionAuthorized({ ...base, amountCents: undefined })).toBe(true);
    expect(isHighRiskTransactionAuthorized({ ...base, amountCents: 0 })).toBe(true);
    expect(isHighRiskTransactionAuthorized({ ...base, amountCents: -1 })).toBe(false);
    expect(isHighRiskTransactionAuthorized({ ...base, amountCents: 1.5 })).toBe(false);
  });

  it("requires verified MFA only when MFA is required (&& branch)", () => {
    expect(isHighRiskTransactionAuthorized({ ...base, requiresMfa: true, mfaVerified: false })).toBe(false);
    expect(isHighRiskTransactionAuthorized({ ...base, requiresMfa: true, mfaVerified: true })).toBe(true);
    expect(isHighRiskTransactionAuthorized({ ...base, requiresMfa: false, mfaVerified: false })).toBe(true);
  });
});

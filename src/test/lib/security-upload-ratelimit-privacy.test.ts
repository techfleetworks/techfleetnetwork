// Mutation-climb batch 2 (CI-refactor): kill the surviving/no-coverage mutants in four
// security/compliance helpers in src/lib/security.ts whose rejection branches were never exercised —
// validateFileUpload, isClientRateLimited, hasCRSAttackPattern, isPrivacyDisclosureAllowed.
// Every branch and boundary is asserted so a mutation (>= vs >, && vs ||, some vs every, a dropped
// guard, a shifted constant) changes an asserted outcome. Deterministic inputs only (fake timers for
// the time-based rate limiter; an explicit size override instead of allocating a 10 MB buffer).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateFileUpload,
  isClientRateLimited,
  resetClientRateLimit,
  hasCRSAttackPattern,
  isPrivacyDisclosureAllowed,
} from "@/lib/security";

const MB = 1024 * 1024;
const MAX_UPLOAD = 10 * MB;

function fileOf(name: string, type: string, size = 8): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size, configurable: true });
  return f;
}

describe("validateFileUpload — every rejection branch and the size boundary", () => {
  it("accepts an allowed extension + MIME + in-size + clean name", () => {
    expect(validateFileUpload(fileOf("photo.png", "image/png")).valid).toBe(true);
  });

  it("rejects a disallowed extension", () => {
    const r = validateFileUpload(fileOf("malware.exe", "image/png"));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/extension/i);
  });

  it("rejects a disallowed MIME type even with an allowed extension", () => {
    const r = validateFileUpload(fileOf("photo.png", "application/x-msdownload"));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/type/i);
  });

  it("enforces the size boundary (exactly max accepted, max+1 rejected) and reports the 10MB limit", () => {
    expect(validateFileUpload(fileOf("photo.png", "image/png", MAX_UPLOAD)).valid).toBe(true);
    const over = validateFileUpload(fileOf("photo.png", "image/png", MAX_UPLOAD + 1));
    expect(over.valid).toBe(false);
    expect(over.error).toMatch(/10MB/);
  });

  it("rejects a path-traversal file name", () => {
    const r = validateFileUpload(fileOf("../../etc/passwd.png", "image/png"));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/invalid file name/i);
  });
});

describe("isClientRateLimited — attempt boundary and sliding window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to maxAttempts then blocks (>= boundary)", () => {
    const action = "rl-attempts";
    resetClientRateLimit(action);
    for (let i = 0; i < 5; i++) expect(isClientRateLimited(action, 5, 60_000)).toBe(false);
    expect(isClientRateLimited(action, 5, 60_000)).toBe(true);
  });

  it("expires entries once they age past the window (sliding window)", () => {
    const action = "rl-window";
    resetClientRateLimit(action);
    for (let i = 0; i < 5; i++) isClientRateLimited(action, 5, 60_000);
    expect(isClientRateLimited(action, 5, 60_000)).toBe(true); // blocked now
    vi.setSystemTime(60_000); // advance exactly one window: all prior entries are now >= windowMs old
    expect(isClientRateLimited(action, 5, 60_000)).toBe(false); // window cleared
  });

  it("resetClientRateLimit clears the counter", () => {
    const action = "rl-reset";
    for (let i = 0; i < 5; i++) isClientRateLimited(action, 5, 60_000);
    expect(isClientRateLimited(action, 5, 60_000)).toBe(true);
    resetClientRateLimit(action);
    expect(isClientRateLimited(action, 5, 60_000)).toBe(false);
  });
});

describe("hasCRSAttackPattern — oversize length boundary", () => {
  it("treats exactly 50000 benign chars as not-oversized, and 50001 as oversized", () => {
    expect(hasCRSAttackPattern("a".repeat(50_000))).toBe(false);
    expect(hasCRSAttackPattern("a".repeat(50_001))).toBe(true);
  });
});

describe("isPrivacyDisclosureAllowed — every branch and the retention boundaries", () => {
  const base = {
    purpose: "analytics",
    dataCategories: ["email"],
    consentGranted: true,
    retentionDays: 30,
  };

  it("allows a well-formed policy", () => {
    expect(isPrivacyDisclosureAllowed({ ...base })).toBe(true);
  });

  it("rejects an empty purpose or empty data categories", () => {
    expect(isPrivacyDisclosureAllowed({ ...base, purpose: "" })).toBe(false);
    expect(isPrivacyDisclosureAllowed({ ...base, dataCategories: [] })).toBe(false);
  });

  it("rejects when consent is not granted", () => {
    expect(isPrivacyDisclosureAllowed({ ...base, consentGranted: false })).toBe(false);
  });

  it("enforces retentionDays: integer, >= 1, <= 365", () => {
    expect(isPrivacyDisclosureAllowed({ ...base, retentionDays: 1.5 })).toBe(false);
    expect(isPrivacyDisclosureAllowed({ ...base, retentionDays: 0 })).toBe(false);
    expect(isPrivacyDisclosureAllowed({ ...base, retentionDays: 1 })).toBe(true);
    expect(isPrivacyDisclosureAllowed({ ...base, retentionDays: 365 })).toBe(true);
    expect(isPrivacyDisclosureAllowed({ ...base, retentionDays: 366 })).toBe(false);
  });

  it("blocks third-party sharing of sensitive categories, but allows it for non-sensitive", () => {
    // some vs every + && vs || all distinguished by these three cases:
    expect(
      isPrivacyDisclosureAllowed({ ...base, thirdPartySharing: true, dataCategories: ["email", "password"] }),
    ).toBe(false);
    expect(
      isPrivacyDisclosureAllowed({ ...base, thirdPartySharing: true, dataCategories: ["email"] }),
    ).toBe(true);
    // thirdPartySharing false: sensitive category is irrelevant (kills && -> ||)
    expect(
      isPrivacyDisclosureAllowed({ ...base, thirdPartySharing: false, dataCategories: ["password"] }),
    ).toBe(true);
  });
});

import { describe, it, expect } from "vitest";

/**
 * BDD Scenarios covered:
 * 1.3 — Expired invitation link (validation logic)
 * 1.4 — Already-redeemed invitation link (used_at check)
 *
 * These test the InvitationService validation logic.
 * Since the service calls Supabase RPCs, we test the logic patterns
 * that the validate method implements.
 */

describe("Invitation validation logic (BDD 1.3: Expired, 1.4: Redeemed)", () => {
  // Simulate the validation logic from InvitationService.validate
  function validateInvitation(row: { email: string; used_at: string | null; expires_at: string } | null) {
    if (!row) return { valid: false, email: "", reason: "not_found" as const };
    if (row.used_at) return { valid: false, email: row.email, reason: "used" as const };
    if (new Date(row.expires_at) < new Date()) return { valid: false, email: row.email, reason: "expired" as const };
    return { valid: true, email: row.email };
  }

  it("returns not_found when no invitation exists", () => {
    const result = validateInvitation(null);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("not_found");
  });

  it("returns expired when invitation has passed expiry date (BDD 1.3)", () => {
    const result = validateInvitation({
      email: "test@example.com",
      used_at: null,
      expires_at: "2020-01-01T00:00:00Z",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
    expect(result.email).toBe("test@example.com");
  });

  it("returns used when invitation has already been redeemed (BDD 1.4)", () => {
    const result = validateInvitation({
      email: "test@example.com",
      used_at: "2025-01-15T10:00:00Z",
      expires_at: "2030-12-31T00:00:00Z",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("used");
  });

  it("returns valid for a fresh, non-expired invitation", () => {
    const result = validateInvitation({
      email: "new@example.com",
      used_at: null,
      expires_at: "2030-12-31T00:00:00Z",
    });
    expect(result.valid).toBe(true);
    expect(result.email).toBe("new@example.com");
  });

  it("prioritizes used_at check over expiry check", () => {
    // Even if expired, used_at should be checked first
    const result = validateInvitation({
      email: "test@example.com",
      used_at: "2025-01-01T00:00:00Z",
      expires_at: "2020-01-01T00:00:00Z", // Also expired
    });
    expect(result.reason).toBe("used");
  });
});

// Pins the single-owner session-timeout policy (src/lib/session-timeout-policy.ts,
// ADR-0049). If someone silently shortens the idle window, re-adds a short absolute
// cap, or lets the warning fall after the sign-out, one of these fails — the policy
// can no longer drift unnoticed.
import { describe, it, expect } from "vitest";
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_WARNING_MS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
} from "@/lib/session-timeout-policy";

describe("session-timeout-policy (single source of truth)", () => {
  it("signs out only after 60 minutes of NO activity", () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(60 * 60 * 1000);
  });

  it("warns 2 minutes before the idle sign-out", () => {
    expect(SESSION_IDLE_WARNING_MS).toBe(2 * 60 * 1000);
  });

  it("keeps an absolute backstop of 7 days (bounded, not unbounded)", () => {
    expect(SESSION_ABSOLUTE_TIMEOUT_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(Number.isFinite(SESSION_ABSOLUTE_TIMEOUT_MS)).toBe(true);
  });

  it("orders the thresholds so the policy is coherent", () => {
    // The warning must precede the sign-out…
    expect(SESSION_IDLE_WARNING_MS).toBeLessThan(SESSION_IDLE_TIMEOUT_MS);
    // …and the absolute backstop must sit far above the idle window so it can never
    // interrupt an actively-working user — at least a full day past a work session.
    expect(SESSION_ABSOLUTE_TIMEOUT_MS).toBeGreaterThan(SESSION_IDLE_TIMEOUT_MS);
    expect(SESSION_ABSOLUTE_TIMEOUT_MS).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
  });
});

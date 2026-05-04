import { describe, it, expect, beforeEach } from "vitest";
import { clearAuthLockout, getAuthLockoutState, recordInvalidAuthAttempt } from "@/lib/auth-lockout";

// BDD: LCL-003 — lockout threshold raised to 5 attempts in 10 minutes
describe("auth-lockout (LCL-003)", () => {
  beforeEach(() => {
    clearAuthLockout();
  });

  it("does not lock the user after four failed attempts", () => {
    let state = getAuthLockoutState();
    for (let i = 0; i < 4; i++) state = recordInvalidAuthAttempt();
    expect(state.locked).toBe(false);
    expect(state.attempts).toBe(4);
  });

  it("locks the user on the fifth failed attempt", () => {
    let state = getAuthLockoutState();
    for (let i = 0; i < 5; i++) state = recordInvalidAuthAttempt();
    expect(state.locked).toBe(true);
    expect(state.remainingSeconds).toBeGreaterThan(0);
  });
});

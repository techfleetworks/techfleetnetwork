import { describe, expect, it } from "vitest";
import { welcomeGateDecision, type WelcomeGateInput } from "../gate-decision";

// The lockout-safety core (§7 / §10): every branch of the mandatory gate's decision, proven
// without rendering. The two invariants that keep ~767 users from being locked out:
//   - a failed/absent profile read NEVER redirects (loop) and NEVER bypasses (skip) → "retry"
//   - /welcome is always allowed → no redirect loop
const base: WelcomeGateInput = {
  loading: false,
  profileLoaded: true,
  profile: { welcome_flow_completed_at: null },
  pathname: "/dashboard",
};

describe("welcomeGateDecision", () => {
  it("waits while auth is still loading", () => {
    expect(welcomeGateDecision({ ...base, loading: true }).kind).toBe("wait");
  });

  it("waits until the profile fetch has settled", () => {
    expect(welcomeGateDecision({ ...base, profileLoaded: false }).kind).toBe("wait");
  });

  it("retries (never redirect, never bypass) when the profile read failed / is absent", () => {
    const d = welcomeGateDecision({ ...base, profile: null });
    expect(d.kind).toBe("retry");
    // Explicit lockout-safety: a null profile must NOT resolve to redirect or allow.
    expect(d.kind).not.toBe("redirect");
    expect(d.kind).not.toBe("allow");
  });

  it("redirects an incomplete, loaded user to /welcome", () => {
    const d = welcomeGateDecision({ ...base, profile: { welcome_flow_completed_at: null } });
    expect(d).toEqual({ kind: "redirect", to: "/welcome" });
  });

  it("allows a completed user through", () => {
    const d = welcomeGateDecision({
      ...base,
      profile: { welcome_flow_completed_at: "2026-11-15T00:00:00Z" },
    });
    expect(d.kind).toBe("allow");
  });

  it("allowlists /welcome so the gate never loops (even with a null profile)", () => {
    expect(
      welcomeGateDecision({ ...base, pathname: "/welcome", profile: null }).kind,
    ).toBe("allow");
  });

  it("allowlists /welcome sub-paths", () => {
    expect(welcomeGateDecision({ ...base, pathname: "/welcome/step" }).kind).toBe("allow");
  });

  it("does not allowlist a lookalike path (/welcome-elsewhere)", () => {
    // A path that merely starts with the word must still be gated.
    expect(welcomeGateDecision({ ...base, pathname: "/welcome-back" }).kind).toBe("redirect");
  });
});

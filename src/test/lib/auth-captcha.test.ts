import { beforeEach, describe, expect, it } from "vitest";
import {
  __authCaptchaTestHooks,
  getLoginCaptchaState,
  hasFreshLoginCaptchaVerification,
  markLoginCaptchaVerified,
  recordFailedLoginAttempt,
} from "@/lib/auth-captcha";

describe("auth CAPTCHA cross-tab state sync (BDD AUTH-CAPTCHA-CROSS-TAB-20260427)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("clears verified state when another tab reports a failed login CAPTCHA attempt", () => {
    markLoginCaptchaVerified();
    expect(hasFreshLoginCaptchaVerification()).toBe(true);

    __authCaptchaTestHooks.applySyncedCaptchaState({
      id: "tab-a-failed",
      reason: "failed",
      failedAttempts: 2,
      sentAt: Date.now(),
    });

    expect(hasFreshLoginCaptchaVerification()).toBe(false);
    expect(getLoginCaptchaState().failedAttempts).toBe(2);
  });

  it("preserves the highest failed-attempt count across tabs", () => {
    recordFailedLoginAttempt();
    expect(getLoginCaptchaState().failedAttempts).toBe(1);

    __authCaptchaTestHooks.applySyncedCaptchaState({
      id: "tab-b-failed",
      reason: "failed",
      failedAttempts: 4,
      sentAt: Date.now(),
    });

    expect(getLoginCaptchaState().failedAttempts).toBe(4);
  });
});

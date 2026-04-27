const CAPTCHA_STATE_KEY = "tfn:login-captcha-state";
const CAPTCHA_VERIFIED_UNTIL_KEY = "tfn:login-captcha-verified-until";
const CAPTCHA_SYNC_STORAGE_KEY = "tfn:login-captcha-sync";
const CAPTCHA_SYNC_CHANNEL = "tfn-login-captcha-sync";
const CAPTCHA_VERIFIED_MS = 2 * 60_000;

type CaptchaSyncReason = "failed" | "refreshed" | "cleared" | "verified";

interface CaptchaSyncMessage {
  id: string;
  reason: CaptchaSyncReason;
  failedAttempts?: number;
  verifiedUntil?: number;
  sentAt: number;
}

export type LoginCaptchaState = {
  failedAttempts: number;
  required: boolean;
  question: string;
  answer: number;
};

function randomInt(min: number, max: number) {
  const range = max - min + 1;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return min + (values[0] % range);
}

function createChallenge(failedAttempts: number): LoginCaptchaState {
  const left = randomInt(4, 19);
  const right = randomInt(3, 17);
  return {
    failedAttempts,
    required: true,
    question: `${left} + ${right}`,
    answer: left + right,
  };
}

function readState(): LoginCaptchaState {
  try {
    const raw = sessionStorage.getItem(CAPTCHA_STATE_KEY);
    if (!raw) return createChallenge(0);
    const parsed = JSON.parse(raw) as Partial<LoginCaptchaState>;
    if (typeof parsed.failedAttempts !== "number" || typeof parsed.answer !== "number" || typeof parsed.question !== "string") {
      return createChallenge(0);
    }
    return { failedAttempts: parsed.failedAttempts, required: true, question: parsed.question, answer: parsed.answer };
  } catch {
    return createChallenge(0);
  }
}

function writeState(state: LoginCaptchaState) {
  try {
    sessionStorage.setItem(CAPTCHA_STATE_KEY, JSON.stringify(state));
  } catch {
    // If storage is unavailable, the visible form still enforces the in-memory state for this render.
  }
}

function writeVerifiedUntil(verifiedUntil: number) {
  if (verifiedUntil > Date.now()) sessionStorage.setItem(CAPTCHA_VERIFIED_UNTIL_KEY, String(verifiedUntil));
  else sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
}

function applySyncedCaptchaState(message: CaptchaSyncMessage) {
  try {
    if (message.reason === "verified" && typeof message.verifiedUntil === "number") {
      writeVerifiedUntil(message.verifiedUntil);
      return;
    }

    sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
    if (message.reason === "cleared") {
      sessionStorage.removeItem(CAPTCHA_STATE_KEY);
      return;
    }

    const current = readState();
    const failedAttempts = Math.max(current.failedAttempts, message.failedAttempts ?? 0);
    writeState(createChallenge(failedAttempts));
  } catch {
    // Cross-tab sync should never block local CAPTCHA enforcement.
  }
}

let syncChannel: BroadcastChannel | null = null;
let syncInstalled = false;

function publishCaptchaSync(reason: CaptchaSyncReason, state?: LoginCaptchaState, verifiedUntil?: number) {
  if (typeof window === "undefined") return;
  const message: CaptchaSyncMessage = {
    id: crypto.randomUUID(),
    reason,
    failedAttempts: state?.failedAttempts,
    verifiedUntil,
    sentAt: Date.now(),
  };

  try {
    syncChannel?.postMessage(message);
  } catch {
    // Fall back to storage events below.
  }

  try {
    localStorage.setItem(CAPTCHA_SYNC_STORAGE_KEY, JSON.stringify(message));
    localStorage.removeItem(CAPTCHA_SYNC_STORAGE_KEY);
  } catch {
    // Storage may be disabled; current tab still enforces CAPTCHA locally.
  }
}

export function installLoginCaptchaCrossTabSync() {
  if (syncInstalled || typeof window === "undefined") return;
  syncInstalled = true;

  try {
    syncChannel = "BroadcastChannel" in window ? new BroadcastChannel(CAPTCHA_SYNC_CHANNEL) : null;
    if (syncChannel) syncChannel.onmessage = (event: MessageEvent<CaptchaSyncMessage>) => applySyncedCaptchaState(event.data);
  } catch {
    syncChannel = null;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== CAPTCHA_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      applySyncedCaptchaState(JSON.parse(event.newValue) as CaptchaSyncMessage);
    } catch {
      // Ignore malformed cross-tab events.
    }
  });
}

export function getLoginCaptchaState(): LoginCaptchaState {
  const state = readState();
  writeState(state);
  return state;
}

export function recordFailedLoginAttempt(): LoginCaptchaState {
  const current = readState();
  const next = createChallenge(current.failedAttempts + 1);
  sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
  writeState(next);
  publishCaptchaSync("failed", next);
  return next;
}

export function clearLoginCaptcha() {
  try {
    sessionStorage.removeItem(CAPTCHA_STATE_KEY);
    sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
    publishCaptchaSync("cleared");
  } catch {
    // Non-critical cleanup.
  }
}

export function isLoginCaptchaRequired(): boolean {
  return true;
}

export function refreshLoginCaptcha(): LoginCaptchaState {
  const current = readState();
  const next = createChallenge(current.failedAttempts);
  writeState(next);
  sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
  publishCaptchaSync("refreshed", next);
  return next;
}

export function hasFreshLoginCaptchaVerification(): boolean {
  try {
    return Number(sessionStorage.getItem(CAPTCHA_VERIFIED_UNTIL_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

export function markLoginCaptchaVerified() {
  try {
    const verifiedUntil = Date.now() + CAPTCHA_VERIFIED_MS;
    sessionStorage.setItem(CAPTCHA_VERIFIED_UNTIL_KEY, String(verifiedUntil));
    publishCaptchaSync("verified", undefined, verifiedUntil);
  } catch {
    // Non-critical: auth forms still rely on the Turnstile verification result before submitting.
  }
}

export function verifyLoginCaptchaAnswer(answer: string): boolean {
  const state = readState();
  if (!state.required) return true;
  const passed = Number(answer.trim()) === state.answer;
  if (passed) markLoginCaptchaVerified();
  else {
    const next = createChallenge(state.failedAttempts);
    writeState(next);
    sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
    publishCaptchaSync("failed", next);
  }
  return passed;
}

export const __authCaptchaTestHooks = {
  applySyncedCaptchaState,
  CAPTCHA_STATE_KEY,
  CAPTCHA_VERIFIED_UNTIL_KEY,
};
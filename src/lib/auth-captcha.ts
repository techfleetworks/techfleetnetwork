const CAPTCHA_STATE_KEY = "tfn:login-captcha-state";
const CAPTCHA_VERIFIED_UNTIL_KEY = "tfn:login-captcha-verified-until";
const CAPTCHA_THRESHOLD = 3;
const CAPTCHA_VERIFIED_MS = 2 * 60_000;

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
    required: failedAttempts >= CAPTCHA_THRESHOLD,
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
    return { failedAttempts: parsed.failedAttempts, required: parsed.failedAttempts >= CAPTCHA_THRESHOLD, question: parsed.question, answer: parsed.answer };
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

export function getLoginCaptchaState(): LoginCaptchaState {
  return readState();
}

export function recordFailedLoginAttempt(): LoginCaptchaState {
  const current = readState();
  const next = createChallenge(current.failedAttempts + 1);
  sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
  writeState(next);
  return next;
}

export function clearLoginCaptcha() {
  try {
    sessionStorage.removeItem(CAPTCHA_STATE_KEY);
    sessionStorage.removeItem(CAPTCHA_VERIFIED_UNTIL_KEY);
  } catch {
    // Non-critical cleanup.
  }
}

export function isLoginCaptchaRequired(): boolean {
  return readState().required;
}

export function hasFreshLoginCaptchaVerification(): boolean {
  try {
    return Number(sessionStorage.getItem(CAPTCHA_VERIFIED_UNTIL_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

export function verifyLoginCaptchaAnswer(answer: string): boolean {
  const state = readState();
  if (!state.required) return true;
  const passed = Number(answer.trim()) === state.answer;
  if (passed) sessionStorage.setItem(CAPTCHA_VERIFIED_UNTIL_KEY, String(Date.now() + CAPTCHA_VERIFIED_MS));
  else writeState(createChallenge(state.failedAttempts));
  return passed;
}
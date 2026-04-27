export const AUTH_THROTTLE_CAPTCHA_CODE = "AUTH_THROTTLE_CAPTCHA_REQUIRED";
export const AUTH_THROTTLE_CAPTCHA_MESSAGE = "Too many rapid auth attempts. Complete the human verification before trying again.";

export type AuthThrottleCaptchaError = Error & {
  status: 429;
  code: typeof AUTH_THROTTLE_CAPTCHA_CODE;
};

export function createAuthThrottleCaptchaError(message = AUTH_THROTTLE_CAPTCHA_MESSAGE): AuthThrottleCaptchaError {
  const error = new Error(message) as AuthThrottleCaptchaError;
  error.name = "AuthThrottleCaptchaError";
  error.status = 429;
  error.code = AUTH_THROTTLE_CAPTCHA_CODE;
  return error;
}

export function isAuthThrottleCaptchaError(error: unknown): error is AuthThrottleCaptchaError {
  const maybe = error as Partial<AuthThrottleCaptchaError> | null | undefined;
  const message = maybe?.message?.toLowerCase() ?? "";
  return maybe?.code === AUTH_THROTTLE_CAPTCHA_CODE || maybe?.status === 429 || message.includes("too many rapid auth attempts");
}
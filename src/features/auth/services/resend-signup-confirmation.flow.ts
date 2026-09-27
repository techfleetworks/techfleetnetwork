/**
 * AUTH-RESEND-FLOW (ADR-0064) — ONE owner of the signup-confirmation RESEND
 * orchestration shared by the register success surface (use-register-engine)
 * and the /auth/confirm page (use-confirm-signup-engine): the rate-limit gate,
 * the captcha-gated resend call through sessionPort, and the ops telemetry on a
 * delivery-unverified failure.
 *
 * The caller keeps what is genuinely surface-local: the captcha-EMPTY guard and
 * its per-surface failure counter, and the exact user-facing wording (each
 * surface returns its own copy off the result status). This removes the
 * duplicated workflow that would otherwise drift between the two engines
 * (global drift rule #1) while leaving the port as the single owner of the send.
 */
import { sessionPort } from "@/features/auth/ports/session.port";
import { RateLimitService } from "@/services/rate-limit.service";
import { telemetryPort } from "@/features/auth/ports/telemetry.port";

export type ResendResult =
  | { status: "ok" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "error"; message?: string };

/**
 * Rate-limit → resend → report. Assumes the caller has already validated the
 * email and confirmed a captcha token is present. Never throws.
 */
export async function resendSignupConfirmationFlow(
  email: string,
  redirectTo: string,
  captchaToken: string
): Promise<ResendResult> {
  const rateCheck = await RateLimitService.check(email, "signup_resend");
  if (!rateCheck.allowed) {
    return { status: "rate_limited", retryAfterSeconds: rateCheck.retry_after };
  }
  try {
    await sessionPort.resendSignupConfirmation(email, redirectTo, captchaToken);
    return { status: "ok" };
  } catch (err) {
    const e = err as { message?: string; status?: number; code?: string };
    // Never swallow — a silent resend outage must be observable in ops
    // (AUTH-ARCH-CUTOVER-011).
    telemetryPort.record("auth_engine.resend_confirmation_email_delivery_unverified", {
      email,
      code: e?.code ?? "unknown",
      status: e?.status ?? null,
    });
    return { status: "error", message: e?.message };
  }
}

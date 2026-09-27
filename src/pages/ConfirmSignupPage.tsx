/**
 * ConfirmSignupPage — presentation for /auth/confirm (ADR-0064).
 *
 * INERT landing for signup confirmation: a scanner/prefetch may GET it, but no
 * verifyOtp runs until the member types the 6-digit code or taps "Confirm my
 * email". State lives in useConfirmSignupEngine. Mirrors ConfirmRecoveryLinkPage.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { TurnstileCaptchaAdapter } from "@/features/auth/adapters/turnstile-captcha.adapter";
import { useConfirmSignupEngine } from "@/features/auth/engine/use-confirm-signup-engine";
import { CheckCircle2 } from "lucide-react";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

export default function ConfirmSignupPage() {
  const e = useConfirmSignupEngine();

  if (e.success) {
    return (
      <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center animate-fade-in card-elevated p-8 space-y-4">
          <CheckCircle2 className="h-16 w-16 text-success mx-auto" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Email confirmed</h1>
          <p className="text-muted-foreground" role="status" aria-live="polite" translate="no">
            You're all set — taking you to your dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in card-elevated p-8 space-y-6">
        <div className="text-center space-y-2">
          <img
            src={techFleetLogo}
            alt=""
            className="h-12 w-12 mx-auto dark:invert"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-foreground">Confirm your email</h1>
          <p className="text-muted-foreground">
            Enter the 6-digit code from your Tech Fleet email
            {e.hasTokenHash ? ", or confirm with one tap." : "."}
          </p>
        </div>

        {e.hasTokenHash && (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={e.handleConfirmByButton}
              disabled={e.verifying}
            >
              {e.verifying ? "Confirming…" : "Confirm my email"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or enter the code</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={e.handleSubmitCode} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-email">Email address</Label>
            <Input
              id="confirm-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={e.email}
              onChange={(ev) => e.setEmail(ev.target.value)}
              readOnly={e.emailLocked}
              aria-readonly={e.emailLocked}
              required
              aria-required="true"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-code">6-digit code</Label>
            <InputOTP
              id="confirm-code"
              maxLength={6}
              value={e.code}
              onChange={e.setCode}
              containerClassName="justify-center"
              aria-label="6-digit confirmation code"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {e.error && (
            <p
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
              aria-live="assertive"
              translate="no"
            >
              {e.error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={e.verifying}>
            {e.verifying ? "Confirming…" : "Confirm my email"}
          </Button>
        </form>

        {e.canResend && (
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm text-muted-foreground">Need a fresh code?</p>
            <TurnstileCaptchaAdapter
              action="signup_confirmation_resend"
              onToken={e.setResendCaptchaToken}
              failureCount={e.resendCaptchaFailureCount}
              email={e.email}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={e.handleResend}
              disabled={e.resending}
            >
              {e.resending ? "Sending…" : "Send me a new code"}
            </Button>
            {e.resendMessage && (
              <p
                className={`rounded-md p-3 text-sm ${e.resendStatus === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                role="status"
                aria-live="polite"
                translate="no"
              >
                {e.resendMessage}
              </p>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link to="/login" className="text-primary-text font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

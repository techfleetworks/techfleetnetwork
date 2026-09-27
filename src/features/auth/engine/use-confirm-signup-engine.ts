/**
 * useConfirmSignupEngine — single source of truth for /auth/confirm (ADR-0064).
 *
 * The page is INERT on load: a link scanner / prefetch may GET it, but NO
 * verifyOtp runs until the member types the 6-digit code or clicks "Confirm my
 * email" (mirrors AUTH-RESET-PREFETCH-001). Confirmation goes through GoTrue OTP
 * via confirm-signup.service (code OR token_hash); on success the SDK holds a
 * real session (client has detectSessionInUrl:false) and we route to the
 * dashboard. Resend reuses the ONE owner (sessionPort.resendSignupConfirmation)
 * behind captcha + rate-limit, exactly as the register success surface does.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  confirmSignupByCode,
  confirmSignupByTokenHash,
} from "@/features/auth/services/confirm-signup.service";
import { resendSignupConfirmationFlow } from "@/features/auth/services/resend-signup-confirmation.flow";
import { telemetryPort } from "@/features/auth/ports/telemetry.port";
import { getCanonicalAppOrigin } from "@/lib/canonical-origin";
import { emailInputSchema } from "@/lib/validators/auth";

const CODE_LENGTH = 6;

type ResendStatus = "idle" | "success" | "error";

// Map a GoTrue verify failure to a friendly, non-dead-end message. The raw code
// is never surfaced. Never reveals whether the email exists (enumeration-safe).
function classifyConfirmError(err: unknown): { message: string; code: string } {
  const e = err as { message?: string; status?: number; code?: string } | null;
  const raw = (e?.message ?? "").toLowerCase();
  const code = (e?.code ?? "").toLowerCase();
  if (e?.status === 429 || raw.includes("rate") || code.startsWith("over_")) {
    return {
      message: "Too many attempts. Please wait a minute, then try again or request a new code.",
      code: "rate_limited",
    };
  }
  if (code.includes("expired") || raw.includes("expired")) {
    return {
      message: "That code has expired. Request a new one below — it only takes a moment.",
      code: "otp_expired",
    };
  }
  if (code.includes("invalid") || raw.includes("invalid") || raw.includes("token")) {
    return {
      message: "That code doesn't match. Check the 6 digits and try again, or request a new code.",
      code: "otp_invalid",
    };
  }
  return {
    message: "We couldn't confirm that code. Try again, or request a new one below.",
    code: "unknown",
  };
}

export interface ConfirmSignupEngine {
  email: string;
  setEmail: (v: string) => void;
  emailLocked: boolean;
  code: string;
  setCode: (v: string) => void;
  hasTokenHash: boolean;
  verifying: boolean;
  success: boolean;
  error: string;
  errorCode: string;
  resending: boolean;
  resendStatus: ResendStatus;
  resendMessage: string;
  resendCaptchaToken: string;
  setResendCaptchaToken: (v: string) => void;
  resendCaptchaFailureCount: number;
  canResend: boolean;
  handleConfirmByButton: () => Promise<void>;
  handleSubmitCode: (e: FormEvent) => Promise<void>;
  handleResend: () => Promise<void>;
}

export function useConfirmSignupEngine(): ConfirmSignupEngine {
  const navigate = useNavigate();
  // Capture URL params ONCE via lazy init so we never setState inside an effect
  // (react-hooks/set-state-in-effect). token_hash is immutable for this mount.
  const [urlParams] = useState(() => {
    try {
      const p = new URL(window.location.href).searchParams;
      return { tokenHash: p.get("token_hash"), email: p.get("email") ?? "" };
    } catch {
      return { tokenHash: null as string | null, email: "" };
    }
  });
  const tokenHash = urlParams.tokenHash;
  const [email, setEmail] = useState(urlParams.email);
  const [emailLocked] = useState(Boolean(urlParams.email));
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [resendMessage, setResendMessage] = useState("");
  const [resendCaptchaToken, setResendCaptchaToken] = useState("");
  const [resendCaptchaFailureCount, setResendCaptchaFailureCount] = useState(0);
  const settledRef = useRef(false);

  // Anti-prefetch / no-cache meta — the same defense the recovery landing uses.
  useEffect(() => {
    const tags: HTMLMetaElement[] = [];
    const add = (attrs: Record<string, string>) => {
      const m = document.createElement("meta");
      Object.entries(attrs).forEach(([k, v]) => m.setAttribute(k, v));
      document.head.appendChild(m);
      tags.push(m);
    };
    add({ name: "robots", content: "noindex,nofollow,noarchive,nosnippet" });
    add({ name: "googlebot", content: "noindex,nofollow" });
    add({ "http-equiv": "Cache-Control", content: "no-store, no-cache, must-revalidate" });
    add({ name: "referrer", content: "no-referrer" });
    return () => {
      tags.forEach((m) => m.remove());
    };
  }, []);

  // INERT boot: strip token_hash/type from the address bar so a single-use proof
  // never lands in history/referrer. Params were captured lazily above; NO verify
  // runs here (scanner/prefetch safe) and NO setState happens in this effect.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("token_hash") || url.searchParams.has("type")) {
        ["token_hash", "type"].forEach((k) => url.searchParams.delete(k));
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    } catch {
      /* noop */
    }
  }, []);

  const onVerified = useCallback(
    (method: "code" | "token_hash") => {
      if (settledRef.current) return;
      settledRef.current = true;
      setSuccess(true);
      // Operator signal (decisions.md §4): backs the ADR-0064 confirmation-
      // success-rate SLI. Never logs the raw code/token_hash.
      telemetryPort.record("auth_engine.confirm_signup_succeeded", { method });
      navigate("/dashboard?from=confirm-email", { replace: true });
    },
    [navigate]
  );

  // Both verify paths funnel their failure — a returned GoTrue error OR a thrown
  // exception — into ONE catch that REPORTS to operators (decisions.md §4 /
  // AUTH-ARCH-CUTOVER-011): a confirmation outage (OTP-expiry misconfig,
  // redirect-allowlist error, an otp_invalid spike) is observable, never a
  // silent user-only message. The raw code/token_hash is never recorded.
  const handleConfirmByButton = useCallback(async () => {
    if (!tokenHash || verifying) return;
    setVerifying(true);
    setError("");
    setErrorCode("");
    try {
      const { error: verifyError } = await confirmSignupByTokenHash(tokenHash);
      if (verifyError) throw verifyError;
      onVerified("token_hash");
    } catch (err) {
      const c = classifyConfirmError(err);
      telemetryPort.record("auth_engine.confirm_signup_failed", {
        method: "token_hash",
        code: c.code,
      });
      setError(c.message);
      setErrorCode(c.code);
    } finally {
      setVerifying(false);
    }
  }, [tokenHash, verifying, onVerified]);

  const handleSubmitCode = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (verifying) return;
      const parsedEmail = emailInputSchema.safeParse(email);
      if (!parsedEmail.success) {
        setError("Enter the email address you signed up with.");
        setErrorCode("email_invalid");
        return;
      }
      const digits = code.replace(/\D/g, "");
      if (digits.length !== CODE_LENGTH) {
        setError(`Enter the ${CODE_LENGTH}-digit code from your email.`);
        setErrorCode("code_incomplete");
        return;
      }
      setVerifying(true);
      setError("");
      setErrorCode("");
      try {
        const { error: verifyError } = await confirmSignupByCode(parsedEmail.data, digits);
        if (verifyError) throw verifyError;
        onVerified("code");
      } catch (err) {
        const c = classifyConfirmError(err);
        telemetryPort.record("auth_engine.confirm_signup_failed", { method: "code", code: c.code });
        setError(c.message);
        setErrorCode(c.code);
      } finally {
        setVerifying(false);
      }
    },
    [email, code, verifying, onVerified]
  );

  const handleResend = useCallback(async () => {
    setResending(true);
    setResendStatus("idle");
    setResendMessage("");
    try {
      const parsedEmail = emailInputSchema.safeParse(email);
      if (!parsedEmail.success) {
        setResendStatus("error");
        setResendMessage("Enter the email address you signed up with, then request a new code.");
        return;
      }
      if (!resendCaptchaToken.trim()) {
        setResendCaptchaFailureCount((c) => c + 1);
        setResendStatus("error");
        setResendMessage("Complete the human verification before requesting a new code.");
        return;
      }
      const result = await resendSignupConfirmationFlow(
        parsedEmail.data,
        getCanonicalAppOrigin() + "/auth/confirm",
        resendCaptchaToken
      );
      if (result.status === "rate_limited") {
        const minutes = Math.ceil(result.retryAfterSeconds / 60);
        setResendStatus("error");
        setResendMessage(
          `Please wait ${minutes} minute${minutes > 1 ? "s" : ""} before requesting another code.`
        );
        return;
      }
      if (result.status === "error") {
        setResendStatus("error");
        setResendMessage(
          result.message ?? "We couldn't send a new code right now. Please try again in a minute."
        );
        return;
      }
      setResendStatus("success");
      setResendMessage(
        "If this email is still awaiting confirmation, a fresh code and link are on the way. Check your inbox and spam folder."
      );
    } finally {
      setResending(false);
    }
  }, [email, resendCaptchaToken]);

  const canResend =
    errorCode === "otp_expired" ||
    errorCode === "otp_invalid" ||
    errorCode === "unknown" ||
    errorCode === "rate_limited";

  return {
    email,
    setEmail,
    emailLocked,
    code,
    setCode,
    hasTokenHash: Boolean(tokenHash),
    verifying,
    success,
    error,
    errorCode,
    resending,
    resendStatus,
    resendMessage,
    resendCaptchaToken,
    setResendCaptchaToken,
    resendCaptchaFailureCount,
    canResend,
    handleConfirmByButton,
    handleSubmitCode,
    handleResend,
  };
}

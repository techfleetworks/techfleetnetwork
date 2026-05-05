import { useEffect, useRef, useState } from "react";
import { markLoginCaptchaVerified } from "@/lib/auth-captcha";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const PRODUCTION_SITE_KEY = "0x4AAAAAADEF72dWIkFxiGOU";
// Cloudflare-published "always passes" test site key. Used ONLY on non-production
// hostnames (Lovable preview/sandbox/localhost) where the production site key is
// not allowlisted in Cloudflare and would render an "invalid domain" error.
// Reference: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TEST_SITE_KEY = "1x00000000000000000000AA";

const PRODUCTION_HOSTNAMES = new Set<string>([
  "techfleetnetwork.lovable.app",
  "www.techfleet.network",
  "techfleet.network",
]);

function resolveSiteKey(): string {
  if (typeof window === "undefined") return PRODUCTION_SITE_KEY;
  const host = window.location.hostname.toLowerCase();
  return PRODUCTION_HOSTNAMES.has(host) ? PRODUCTION_SITE_KEY : TEST_SITE_KEY;
}

const TURNSTILE_SITE_KEY = resolveSiteKey();

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileErrorKind = "expired" | "network" | "challenge" | "unknown";

type TurnstileChallengeProps = {
  action: "login" | "register" | "forgot_password" | "signup_confirmation_resend";
  onTokenChange: (token: string) => void;
  failureCount?: number;
};

// Cloudflare error code prefixes — see https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/
function classifyTurnstileError(code?: string): TurnstileErrorKind {
  if (!code) return "unknown";
  if (code.startsWith("11") || code === "300010" || code === "300020") return "expired";
  if (code.startsWith("2") || code.startsWith("6")) return "network"; // network/timeout
  if (code.startsWith("3") || code.startsWith("4") || code.startsWith("5")) return "challenge";
  return "unknown";
}

export function TurnstileChallenge({ action, onTokenChange, failureCount = 0 }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(Boolean(window.turnstile));
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [transientError, setTransientError] = useState<TurnstileErrorKind | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const lastFailureCountRef = useRef(failureCount);

  const resetWidget = () => {
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch { /* ignore */ }
    }
  };

  const beginRetryCountdown = () => {
    onTokenChange("");
    // Only lock out after 2+ consecutive failures. First failure → silent auto-reset.
    if (consecutiveFailuresRef.current >= 2) setRetrySeconds(30);
    else resetWidget();
  };

  useEffect(() => {
    if (window.turnstile) {
      setScriptReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(true);
    if (!existing) document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: "auto",
      "refresh-expired": "auto",
      "retry": "auto",
      callback: (token: string) => {
        consecutiveFailuresRef.current = 0;
        setTransientError(null);
        setRetrySeconds(0);
        // Cloudflare returned a real token → unblock our local fetch interceptor.
        // Supabase still verifies the token server-side via the captchaToken option,
        // so this marker only governs the client-side defense-in-depth gate.
        markLoginCaptchaVerified();
        onTokenChange(token);
      },
      "expired-callback": () => {
        // Token expired before submit — silently get a fresh one, don't penalize the user.
        setTransientError("expired");
        onTokenChange("");
        resetWidget();
      },
      "error-callback": (code?: string) => {
        consecutiveFailuresRef.current += 1;
        const kind = classifyTurnstileError(code);
        setTransientError(kind);
        beginRetryCountdown();
      },
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenChange("");
    };
  }, [action, onTokenChange, scriptReady]);

  useEffect(() => {
    // Only treat external failures (e.g. server-side CAPTCHA rejection) as a real failure.
    if (failureCount > lastFailureCountRef.current) {
      consecutiveFailuresRef.current += 1;
      setTransientError("challenge");
      beginRetryCountdown();
    }
    lastFailureCountRef.current = failureCount;
  }, [failureCount]);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRetrySeconds((current) => {
        if (current <= 1) {
          resetWidget();
          return 0;
        }
        return current - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [retrySeconds]);

  const errorMessage = (() => {
    if (retrySeconds > 0) {
      const base = transientError === "network"
        ? "Verification couldn't reach Cloudflare."
        : "Human verification didn't go through.";
      return `${base} Please retry in ${retrySeconds} second${retrySeconds === 1 ? "" : "s"}.`;
    }
    if (transientError === "expired") return "Verification refreshed — please wait a moment.";
    if (transientError === "network") return "Verification is having trouble reaching Cloudflare. Retrying…";
    return null;
  })();

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3" role="group" aria-label="Human verification">
      <div ref={containerRef} className={retrySeconds > 0 ? "min-h-[65px] pointer-events-none opacity-60" : "min-h-[65px]"} />
      {!scriptReady && <p className="text-sm text-muted-foreground" aria-live="polite">Loading verification…</p>}
      {errorMessage && (
        <p
          className={`mt-2 rounded-md px-3 py-2 text-sm ${retrySeconds > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
          role={retrySeconds > 0 ? "alert" : "status"}
          aria-live={retrySeconds > 0 ? "assertive" : "polite"}
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
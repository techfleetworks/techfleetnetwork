import { useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SITE_KEY = "0x4AAAAAADEF72dWIkFxiGOU";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileChallengeProps = {
  action: "login" | "register" | "forgot_password";
  onTokenChange: (token: string) => void;
};

export function TurnstileChallenge({ action, onTokenChange }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(Boolean(window.turnstile));

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
      callback: (token: string) => onTokenChange(token),
      "expired-callback": () => onTokenChange(""),
      "error-callback": () => onTokenChange(""),
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenChange("");
    };
  }, [action, onTokenChange, scriptReady]);

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3" role="group" aria-label="Human verification">
      <div ref={containerRef} className="min-h-[65px]" />
      {!scriptReady && <p className="text-sm text-muted-foreground" aria-live="polite">Loading verification…</p>}
    </div>
  );
}
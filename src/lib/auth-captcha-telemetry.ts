import { logAccountActivity } from "@/lib/account-activity";

type CaptchaTelemetryEvent = "auth_captcha_failed" | "auth_captcha_fetch_blocked";

const TELEMETRY_DEDUPE_MS = 15_000;
const lastLoggedAt = new Map<string, number>();

function shouldLog(key: string, now = Date.now()): boolean {
  const previous = lastLoggedAt.get(key) ?? 0;
  if (now - previous < TELEMETRY_DEDUPE_MS) return false;
  lastLoggedAt.set(key, now);
  return true;
}

export function logCaptchaTelemetry(event: CaptchaTelemetryEvent, details: Record<string, unknown> = {}) {
  const surface = typeof details.surface === "string" ? details.surface : "unknown";
  const key = `${event}:${surface}`;
  if (!shouldLog(key)) return;
  void logAccountActivity(event, {
    details: {
      surface,
      path: window.location.pathname,
      userAgentFamily: navigator.userAgent.slice(0, 80),
      ...details,
    },
  });
}
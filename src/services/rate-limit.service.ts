import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { createAuthThrottleCaptchaError, isAuthThrottleCaptchaError } from "@/lib/auth-throttle-captcha";

const log = createLogger("RateLimitService");

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after: number;
}

/**
 * Hash an identifier in the browser before sending it to the database.
 * Mirrors the legacy edge-function behaviour (server-side digest with the
 * service-role key) closely enough for rate-limit bucketing while keeping
 * raw emails out of `public.rate_limits`. We use a fixed pepper baked into
 * the build because the service-role key cannot leave the server.
 */
async function hashIdentifier(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value + "::tfn-rate-limit-v1");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const VALID_ACTIONS = new Set(["login_attempt", "signup_attempt", "password_reset"]);

/**
 * RateLimitService — calls `check_rate_limit` directly via PostgREST RPC.
 *
 * Audit (2026-04-18) recommended removing the `rate-limit` edge function
 * indirection because cold starts can add 100–500 ms to login UX during
 * peak events. PostgREST RPC has no cold-start overhead and inherits the
 * same RLS / SECURITY DEFINER guarantees as the previous flow.
 *
 * Identifier is SHA-256 hashed in the browser to keep raw emails out of
 * the rate_limits table — this is privacy hygiene, not a secrecy boundary
 * (an attacker who controls the client can already supply any identifier).
 *
 * Fails open on any unexpected error so a transient DB blip cannot lock
 * legitimate users out of authentication.
 */
export const RateLimitService = {
  async check(identifier: string, action: string): Promise<RateLimitResult> {
    log.debug("check", `Checking rate limit for action "${action}"`, { action });

    if (!identifier || typeof identifier !== "string" || identifier.length > 255) {
      log.warn("check", `Invalid identifier — failing open`, { action });
      return { allowed: true, remaining: 5, retry_after: 0 };
    }
    if (!VALID_ACTIONS.has(action)) {
      log.warn("check", `Unknown action "${action}" — failing open`, { action });
      return { allowed: true, remaining: 5, retry_after: 0 };
    }

    try {
      const hashed = await hashIdentifier(identifier);
      const isLogin = action === "login_attempt";
      const { data, error } = await supabase.rpc("check_rate_limit", {
        p_identifier: hashed,
        p_action: action,
        p_max_attempts: isLogin ? 6 : 3,
        p_window_minutes: 15,
        p_block_minutes: isLogin ? 60 : 60,
      });
      if (error) {
        if (isAuthThrottleCaptchaError(error) || error.message?.toLowerCase().includes("too many rapid auth attempts")) {
          throw createAuthThrottleCaptchaError();
        }
        log.warn("check", `Rate limit RPC failed for "${action}" — failing open: ${error.message}`, { action }, error);
        return { allowed: true, remaining: 5, retry_after: 0 };
      }
      const result = (data ?? { allowed: true, remaining: 5, retry_after: 0 }) as unknown as RateLimitResult;
      if (!result.allowed) {
        log.warn("check", `Rate limit exceeded for "${action}" — blocked for ${result.retry_after}s`, {
          action,
          remaining: result.remaining,
          retryAfter: result.retry_after,
        });
      } else {
        log.debug("check", `Rate limit OK for "${action}" — ${result.remaining} attempts remaining`, {
          action,
          remaining: result.remaining,
        });
      }
      return result;
    } catch (err) {
      if (isAuthThrottleCaptchaError(err)) throw err;
      log.error("check", `Unexpected error during rate limit check for "${action}" — failing open`, { action }, err);
      return { allowed: true, remaining: 5, retry_after: 0 };
    }
  },
};

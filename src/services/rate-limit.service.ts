import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("RateLimitService");

/** Hash an identifier client-side for rate limit lookups */
async function hashIdentifier(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after: number;
}

export const RateLimitService = {
  async check(identifier: string, action: string): Promise<RateLimitResult> {
    log.debug("check", `Checking rate limit for action "${action}"`, { action });
    try {
      const { data, error } = await supabase.functions.invoke("rate-limit", {
        body: { identifier, action },
      });
      if (error) {
        log.warn("check", `Rate limit check failed for action "${action}" — failing open: ${error.message}`, { action }, error);
        return { allowed: true, remaining: 5, retry_after: 0 }; // Fail open
      }
      const result = data as RateLimitResult;
      if (!result.allowed) {
        log.warn("check", `Rate limit exceeded for action "${action}" — blocked for ${result.retry_after}s`, {
          action,
          remaining: result.remaining,
          retryAfter: result.retry_after,
        });
      } else {
        log.debug("check", `Rate limit OK for action "${action}" — ${result.remaining} attempts remaining`, {
          action,
          remaining: result.remaining,
        });
      }
      return result;
    } catch (err) {
      log.error("check", `Unexpected error during rate limit check for action "${action}" — failing open`, { action }, err);
      return { allowed: true, remaining: 5, retry_after: 0 }; // Fail open
    }
  },
};

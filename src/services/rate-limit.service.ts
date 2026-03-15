import { supabase } from "@/integrations/supabase/client";

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
    try {
      const { data, error } = await supabase.functions.invoke("rate-limit", {
        body: { identifier, action },
      });
      if (error) return { allowed: true, remaining: 5, retry_after: 0 }; // Fail open
      return data as RateLimitResult;
    } catch {
      return { allowed: true, remaining: 5, retry_after: 0 }; // Fail open
    }
  },
};

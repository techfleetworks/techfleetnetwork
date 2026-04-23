/**
 * Centralized accessor for the Supabase service-role (admin) client.
 *
 * Why this exists
 * ---------------
 * Forty-three edge functions previously called
 * `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` directly. That made key rotation
 * impossible without touching every function. This module:
 *
 *  1. Provides ONE place to read the service-role key.
 *  2. Memoizes the admin client per-isolate so we don't pay the createClient()
 *     cost on every request.
 *  3. Validates env vars on first use and throws a clear error if any are
 *     missing (instead of producing a confusing 500 mid-request).
 *  4. Logs (once per isolate) a warning if `SUPABASE_SERVICE_ROLE_ROTATED_AT`
 *     is older than 90 days, so we know when to rotate.
 *
 * Rotation runbook
 * ----------------
 * 1. In Lovable Cloud → Backend → Settings, rotate the service role key.
 * 2. Set the secret `SUPABASE_SERVICE_ROLE_ROTATED_AT` to today's ISO date.
 * 3. Trigger a redeploy of edge functions (any code push works).
 *    No code changes are required — every function imports from here.
 *
 * Threat model
 * ------------
 * The service-role key bypasses RLS. If it leaks (e.g. via a misconfigured
 * log, a screenshot, a compromised CI token), the entire database is exposed.
 * Quarterly rotation limits the value of a stolen key to 90 days max.
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

let cached: SupabaseClient | null = null;
let rotationWarned = false;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function checkRotation() {
  if (rotationWarned) return;
  const rotatedAt = Deno.env.get("SUPABASE_SERVICE_ROLE_ROTATED_AT");
  if (!rotatedAt) {
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "secret_rotation_check",
        msg: "SUPABASE_SERVICE_ROLE_ROTATED_AT not set — cannot determine key age. See SECURITY_INCIDENT_RESPONSE.md.",
      }),
    );
    rotationWarned = true;
    return;
  }
  const rotatedTs = Date.parse(rotatedAt);
  if (Number.isFinite(rotatedTs) && Date.now() - rotatedTs > NINETY_DAYS_MS) {
    const ageDays = Math.floor((Date.now() - rotatedTs) / (24 * 60 * 60 * 1000));
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "secret_rotation_check",
        msg: `SUPABASE_SERVICE_ROLE_KEY is ${ageDays} days old — rotation recommended (>90 days).`,
      }),
    );
    rotationWarned = true;
  }
}

/**
 * Returns a memoized admin Supabase client (bypasses RLS).
 * Use ONLY for legitimate elevated operations: writing audit logs,
 * fan-out, cross-user reads that have already been authorized.
 *
 * NEVER use this client for reads that originate from a user request
 * unless you have already verified the user has permission via
 * `has_role`, RLS-equivalent checks, or admin verification.
 */
export function getAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  checkRotation();
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Returns a Supabase client scoped to the calling user's JWT.
 * RLS is enforced. Use this for any read that should respect the user's
 * permissions.
 */
export function getUserClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY/PUBLISHABLE_KEY is not configured");

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Convenience helper: extracts and validates the bearer JWT from a request.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!auth) return null;
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

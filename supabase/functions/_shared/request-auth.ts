import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  extractBearerToken,
  getAdminClient,
  getUserClient,
} from "./admin-client.ts";
import { jsonResponse } from "./http.ts";
import { auditEdgeEvent, getOrCreateTraceId } from "./audit.ts";
import type { AuditSeverity } from "./audit.ts";

export interface AuthenticatedRequestContext {
  authHeader: string;
  token: string;
  userId: string;
  userClient: SupabaseClient;
}

/**
 * Server-side owner of "is this access token's session revoked?" enforcement.
 *
 * The revocation fact has ONE owner — the DB function `public.is_session_revoked`
 * reading `public.revoked_sessions` (self-revoke / admin revoke / global sign-out all
 * write that row). Before this check, the ONLY reader was the browser
 * (`src/features/auth/services/session.service.ts`), so a stolen access or refresh
 * token used directly against PostgREST or an edge function — i.e. NOT through our
 * SPA — never saw the revoked check and kept working after the victim/admin revoked
 * it (re-audit 2026-10-30 SEC-1 / RH1, OWASP Session Management: server-side
 * invalidation). This helper makes EVERY authenticated edge call a reader of the same
 * owner, so the check runs where the attacker actually is.
 *
 * `iat` is the access token's issued-at (seconds since epoch, from the validated JWT
 * claims). `is_session_revoked(user, issued_at)` returns true when the row says this
 * token predates the revocation cutoff. Returns null when `iat` is absent/non-numeric
 * — a validated GoTrue JWT always carries it, so its absence is treated as
 * unverifiable and the caller fails closed.
 */
export function issuedAtIsoFromClaims(claims: unknown): string | null {
  const iat = (claims as { iat?: unknown } | null | undefined)?.iat;
  if (typeof iat !== "number" || !Number.isFinite(iat)) return null;
  return new Date(iat * 1000).toISOString();
}

/**
 * Optional `fn` lets the helper emit `authn_unauthorized` / `authz_admin_denied`
 * audit rows tagged with the calling function name. Backwards-compatible
 * (older call sites that omit `fn` simply skip the audit emission).
 */
export async function requireAuthenticatedRequest(
  req: Request,
  fn?: string,
  options: { missingTokenSeverity?: AuditSeverity; auditClient?: SupabaseClient } = {},
): Promise<AuthenticatedRequestContext | Response> {
  const token = extractBearerToken(req);
  if (!token) {
    if (fn) {
      void auditEdgeEvent(options.auditClient ?? getAdminClient(), {
        fn,
        event: "authn_unauthorized",
        severity: options.missingTokenSeverity ?? "warn",
        traceId: getOrCreateTraceId(req),
        fields: ["reason:missing_token"],
      });
    }
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const authHeader = `Bearer ${token}`;
  const userClient = getUserClient(authHeader);
  const { data, error } = await userClient.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) {
    if (fn) {
      void auditEdgeEvent(options.auditClient ?? getAdminClient(), {
        fn,
        event: "authn_unauthorized",
        severity: "warn",
        traceId: getOrCreateTraceId(req),
        fields: ["reason:invalid_token"],
      });
    }
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Server-side session revocation (SEC-1 / RH1). A stolen token that bypasses the
  // SPA still lands here, so this is where revocation must be enforced — one server
  // owner, not the browser. The revoked check runs for EVERY authenticated edge call.
  const issuedAtIso = issuedAtIsoFromClaims(data?.claims);
  if (!issuedAtIso) {
    // A validated JWT with no numeric `iat` is unverifiable for revocation — fail closed.
    if (fn) {
      void auditEdgeEvent(options.auditClient ?? getAdminClient(), {
        fn,
        event: "authn_unauthorized",
        severity: "warn",
        userId,
        traceId: getOrCreateTraceId(req),
        fields: ["reason:missing_iat"],
      });
    }
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: revoked, error: revokeError } = await userClient.rpc("is_session_revoked", {
    _user_id: userId,
    _issued_at: issuedAtIso,
  });

  if (revokeError) {
    // Report (don't hide) and fail closed: a token whose revocation status we cannot
    // determine is not honored. 503 (not 401) is deliberate — a transient DB error is
    // retryable and must NOT read as a credential verdict that forces a client sign-out
    // (the June 2026 lockout class). See ADR 20261106-server-side-session-revocation.
    if (fn) {
      void auditEdgeEvent(options.auditClient ?? getAdminClient(), {
        fn,
        event: "authn_unauthorized",
        severity: "error",
        userId,
        traceId: getOrCreateTraceId(req),
        errorMessage: revokeError.message,
        fields: ["reason:revocation_check_failed"],
      });
    }
    return jsonResponse({ error: "Unable to verify session" }, 503);
  }

  if (revoked === true) {
    if (fn) {
      void auditEdgeEvent(options.auditClient ?? getAdminClient(), {
        fn,
        event: "authn_unauthorized",
        severity: "warn",
        userId,
        traceId: getOrCreateTraceId(req),
        fields: ["reason:session_revoked"],
      });
    }
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { authHeader, token, userId, userClient };
}

export async function requireAdminRequest(
  req: Request,
  fn?: string,
): Promise<AuthenticatedRequestContext | Response> {
  const auth = await requireAuthenticatedRequest(req, fn);
  if (auth instanceof Response) return auth;

  const { data, error } = await getAdminClient().rpc("has_role", {
    _user_id: auth.userId,
    _role: "admin",
  });

  if (error) {
    console.error(
      JSON.stringify({ level: "error", action: "admin_authorization_check" }),
    );
    if (fn) {
      void auditEdgeEvent(getAdminClient(), {
        fn,
        event: "authz_check_failed",
        severity: "error",
        userId: auth.userId,
        traceId: getOrCreateTraceId(req),
        errorMessage: error.message,
      });
    }
    return jsonResponse({ error: "Unable to verify authorization" }, 500);
  }

  if (data !== true) {
    if (fn) {
      void auditEdgeEvent(getAdminClient(), {
        fn,
        event: "authz_admin_denied",
        severity: "warn",
        userId: auth.userId,
        traceId: getOrCreateTraceId(req),
        fields: ["required_role:admin"],
      });
    }
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return auth;
}

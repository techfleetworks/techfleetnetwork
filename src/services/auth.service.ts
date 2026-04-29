import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { logAccountActivity } from "@/lib/account-activity";
import { getSessionPolicyFailureReason } from "@/lib/security";
import { clearOAuthUiMarker, hasFreshOAuthUiMarker, isRootOAuthCallback, stripRootOAuthCallbackUrl } from "@/lib/oauth-ui-guard";
import { emailInputSchema, passwordSchema } from "@/lib/validators/auth";
import { createAuthThrottleCaptchaError, isAuthThrottleCaptchaError } from "@/lib/auth-throttle-captcha";
import { validateEmailDomainExists } from "@/lib/email-domain-validation";

const log = createLogger("AuthService");
const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours absolute maximum
const IDLE_SESSION_AGE_MS = 20 * 60 * 1000;
const SESSION_STARTED_AT_KEY = "session_started_at";
const SESSION_MARKER_VERSION = 1;
const AUTH_STORAGE_KEY_PATTERN = /^sb-.*-auth-token$/;
const blockedAuthInputError = new Error("Enter a valid email address.");

type AuthSession = NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>;

interface SessionMarker {
  version: number;
  userId: string;
  startedAtMs: number;
  lastActivityAtMs?: number;
}

function writeSessionMarker(session: Pick<AuthSession, "user">, startedAtMs = Date.now()) {
  sessionStorage.setItem(
    SESSION_STARTED_AT_KEY,
    JSON.stringify({ version: SESSION_MARKER_VERSION, userId: session.user.id, startedAtMs } satisfies SessionMarker),
  );
}

function touchSessionMarker(session: Pick<AuthSession, "user">, marker: { startedAtMs: number }) {
  sessionStorage.setItem(
    SESSION_STARTED_AT_KEY,
    JSON.stringify({ version: SESSION_MARKER_VERSION, userId: session.user.id, startedAtMs: marker.startedAtMs, lastActivityAtMs: Date.now() } satisfies SessionMarker),
  );
}

function readSessionMarker(session: Pick<AuthSession, "user">): { startedAtMs: number; lastActivityAtMs: number; resetReason: string | null } {
  const raw = sessionStorage.getItem(SESSION_STARTED_AT_KEY);
  if (!raw) return { startedAtMs: Date.now(), lastActivityAtMs: Date.now(), resetReason: "missing" };

  const legacyStartedAt = Number(raw);
  if (Number.isFinite(legacyStartedAt)) return { startedAtMs: Date.now(), lastActivityAtMs: Date.now(), resetReason: "legacy" };

  try {
    const marker = JSON.parse(raw) as Partial<SessionMarker>;
    if (marker.version !== SESSION_MARKER_VERSION || marker.userId !== session.user.id || !Number.isFinite(marker.startedAtMs)) {
      return { startedAtMs: Date.now(), lastActivityAtMs: Date.now(), resetReason: "mismatch" };
    }
    return { startedAtMs: marker.startedAtMs, lastActivityAtMs: Number.isFinite(marker.lastActivityAtMs) ? marker.lastActivityAtMs! : marker.startedAtMs, resetReason: null };
  } catch {
    return { startedAtMs: Date.now(), lastActivityAtMs: Date.now(), resetReason: "malformed" };
  }
}

function isInvalidRefreshTokenError(error: unknown) {
  const maybeError = error as { message?: string; status?: number; name?: string } | null | undefined;
  const message = maybeError?.message?.toLowerCase() ?? String(error ?? "").toLowerCase();
  const mentionsRefreshToken = message.includes("refresh token");
  const terminalRefreshState =
    message.includes("invalid") ||
    message.includes("not found") ||
    message.includes("missing") ||
    message.includes("expired") ||
    message.includes("revoked") ||
    message.includes("already used") ||
    message.includes("reuse");

  return mentionsRefreshToken && terminalRefreshState;
}

function clearLocalAuthArtifacts() {
  sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
  for (const storage of [localStorage, sessionStorage]) {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key && AUTH_STORAGE_KEY_PATTERN.test(key)) storage.removeItem(key);
    }
  }
}

function hasStoredAuthSession() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (url.searchParams.has("code") || hash.has("access_token") || hash.has("refresh_token")) {
    return isRootOAuthCallback(url) && hasFreshOAuthUiMarker();
  }

  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && AUTH_STORAGE_KEY_PATTERN.test(key) && storage.getItem(key)) return true;
    }
  }
  return false;
}

async function recoverFromInvalidRefreshToken(error: unknown, source: string) {
  const maybeError = error as { message?: string; status?: number } | null | undefined;
  log.warn(source, "Stored refresh token is no longer valid — clearing local auth state", undefined, error);
  void logAccountActivity("invalid_refresh_token_cleared", {
    errorMessage: maybeError?.message ?? String(error ?? "Invalid refresh token"),
    errorCode: maybeError?.status,
    details: { source },
  });
  clearLocalAuthArtifacts();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}

async function logAdminLoginIfElevated(userId?: string | null) {
  if (!userId) return;

  try {
    const { count, error } = await supabase
      .from("user_roles")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("role", "admin");

    if (error || (count ?? 0) === 0) return;

    await supabase.rpc("write_audit_log", {
      p_event_type: "authn_admin_login_success",
      p_table_name: "auth.users",
      p_record_id: userId,
      p_user_id: userId,
      p_changed_fields: [
        `origin:${window.location.origin}`,
        `path:${window.location.pathname}`,
        `user_agent:${navigator.userAgent.slice(0, 160)}`,
      ],
      p_error_message: null,
    });
  } catch {
    // Admin login telemetry must never block a successful login.
  }
}

export const AuthService = {
  async signInWithPassword(email: string, password: string, captchaToken?: string) {
    const parsedEmail = emailInputSchema.safeParse(email);
    if (!parsedEmail.success || !passwordSchema.safeParse(password).success) {
      throw blockedAuthInputError;
    }
    if (!captchaToken?.trim()) {
      throw new Error("Complete the human verification before trying again.");
    }
    const safeEmail = parsedEmail.data;
    const domainCheck = await validateEmailDomainExists(safeEmail);
    if (!domainCheck.valid) throw new Error(domainCheck.message ?? "Use an email address with a real domain.");
    void logAccountActivity("login_attempt_started", { email: safeEmail });
    return log.track("signInWithPassword", `Authenticating user ${safeEmail}`, { email: safeEmail }, async () => {
      const { data, error } = await supabase.functions.invoke<{ session: AuthSession; user: AuthSession["user"] }>("login-with-captcha", {
        body: { email: safeEmail, password, captchaToken: captchaToken.trim() },
      }).then(async (res) => {
        if (res.error) return { data: null, error: res.error };
        if (res.data?.session?.access_token && res.data.session.refresh_token) {
          const setSessionResult = await supabase.auth.setSession({
            access_token: res.data.session.access_token,
            refresh_token: res.data.session.refresh_token,
          });
          return setSessionResult;
        }
        return { data: null, error: new Error("Invalid login response") };
      });
      if (error) {
        log.error("signInWithPassword", `Authentication failed for ${safeEmail}: ${error.message}`, { email: safeEmail, errorCode: error.status }, error);
        void logAccountActivity("login_failed", { email: safeEmail, errorMessage: error.message, errorCode: error.status });
        if (error.status === 429 || error.message.toLowerCase().includes("too many rapid auth attempts")) throw createAuthThrottleCaptchaError();
        throw new Error("Invalid email or password. Please try again.");
      }
      if (data.session) writeSessionMarker(data.session);
      log.info("signInWithPassword", `User ${safeEmail} authenticated successfully`, { userId: data.user?.id });
      void logAccountActivity("login_succeeded", { email: safeEmail, userId: data.user?.id });
      void logAdminLoginIfElevated(data.user?.id);
      return data;
    });
  },

  async signUp(email: string, password: string, firstName: string, lastName: string, redirectTo: string, captchaToken: string) {
    const parsedEmail = emailInputSchema.safeParse(email);
    if (!parsedEmail.success || !passwordSchema.safeParse(password).success) {
      throw blockedAuthInputError;
    }
    const safeCaptchaToken = captchaToken.trim();
    if (!safeCaptchaToken) throw new Error("Complete the human verification before trying again.");
    const safeEmail = parsedEmail.data;
    const domainCheck = await validateEmailDomainExists(safeEmail);
    if (!domainCheck.valid) throw new Error(domainCheck.message ?? "Use an email address with a real domain.");
    void logAccountActivity("signup_attempt_started", { email: safeEmail, details: { hasName: Boolean(firstName && lastName) } });
    return log.track("signUp", `Registering new user ${safeEmail}`, { email: safeEmail, firstName, lastName }, async () => {
      const attempt = async () =>
        supabase.auth.signUp({
          email: safeEmail,
          password,
          options: {
            data: {
              full_name: `${firstName} ${lastName}`.trim(),
              first_name: firstName,
              last_name: lastName,
            },
            emailRedirectTo: redirectTo,
            captchaToken: safeCaptchaToken,
          },
        });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Sign-up request timed out. Please try again.")), 30_000)
      );

      // Auto-retry once on transient 5xx / network blips before surfacing.
      let lastErr: { message: string; status?: number; code?: string } | null = null;
      let data: any = null;
      for (let i = 0; i < 2; i++) {
        try {
          const res = await Promise.race([attempt(), timeoutPromise]);
          if (!res.error) { data = res.data; lastErr = null; break; }
          if (res.error.status === 429 || res.error.message.toLowerCase().includes("too many rapid auth attempts")) throw createAuthThrottleCaptchaError();
          lastErr = { message: res.error.message, status: res.error.status, code: (res.error as any).code };
          const transient = !res.error.status || res.error.status >= 500 || res.error.status === 0;
          if (!transient) break;
          await new Promise(r => setTimeout(r, 600 * (i + 1)));
        } catch (networkErr: any) {
          if (isAuthThrottleCaptchaError(networkErr)) throw networkErr;
          // Catches the timeoutPromise rejection AND any fetch-level network failures (offline, DNS, CORS).
          lastErr = { message: networkErr?.message ?? "Network error", status: 0 };
          void logAccountActivity("signup_network_error", { email: safeEmail, errorMessage: lastErr.message });
          break;
        }
      }

      if (lastErr) {
        // Persist the REAL Supabase error so admins can diagnose, but surface a friendly mapped message to the user.
        log.error("signUp", `Registration failed for ${safeEmail}: [${lastErr.status ?? "?"}] ${lastErr.message}`,
          { email: safeEmail, errorCode: lastErr.status, errorName: lastErr.code }, lastErr as Error);
        void logAccountActivity("signup_supabase_error", {
          email: safeEmail,
          errorMessage: lastErr.message,
          errorCode: lastErr.status ?? lastErr.code ?? "unknown",
        });

        const m = (lastErr.message || "").toLowerCase();
        // Map common Supabase auth errors to actionable user messaging.
        if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already")) {
          throw new Error("An account with this email already exists. Try signing in or resetting your password.");
        }
        if (m.includes("pwned") || m.includes("compromised")) {
          throw new Error("This password has appeared in a known data breach. Please choose a different password.");
        }
        if (m.includes("weak") || m.includes("password should") || m.includes("password must")) {
          throw new Error(`Password rejected: ${lastErr.message}`);
        }
        if (m.includes("rate") || lastErr.status === 429) {
          throw new Error("Too many signup attempts from your network. Please wait a few minutes and try again.");
        }
        if (m.includes("invalid") && m.includes("email")) {
          throw new Error("That email address looks invalid. Please double-check and try again.");
        }
        if (m.includes("signup") && m.includes("disabled")) {
          throw new Error("Account creation is temporarily unavailable. Please contact support.");
        }
        if (lastErr.status && lastErr.status >= 500) {
          throw new Error("The signup service is temporarily unavailable. Please try again in a minute.");
        }
        // Last-resort: surface the actual server message so the user (and we) can act on it.
        throw new Error(lastErr.message || "Unable to create account. Please try again or use a different email.");
      }

      log.info("signUp", `User ${safeEmail} registered successfully, confirmation email sent`, {
        userId: data?.user?.id,
        confirmationRequired: !data?.session,
      });
      void logAccountActivity("signup_succeeded", {
        email: safeEmail,
        userId: data?.user?.id,
        details: { confirmationRequired: !data?.session },
      });
      return data;
    });
  },

  async resendSignupConfirmation(email: string, redirectTo: string, captchaToken: string) {
    const parsedEmail = emailInputSchema.safeParse(email);
    if (!parsedEmail.success) throw blockedAuthInputError;
    const safeCaptchaToken = captchaToken.trim();
    if (!safeCaptchaToken) throw new Error("Complete the human verification before trying again.");
    const safeEmail = parsedEmail.data;
    const domainCheck = await validateEmailDomainExists(safeEmail);
    if (!domainCheck.valid) throw new Error(domainCheck.message ?? "Use an email address with a real domain.");
    void logAccountActivity("signup_confirmation_resend_requested", { email: safeEmail });
    return log.track("resendSignupConfirmation", `Requesting signup confirmation email for ${safeEmail}`, { email: safeEmail }, async () => {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: safeEmail,
        options: { emailRedirectTo: redirectTo, captchaToken: safeCaptchaToken },
      });

      if (error) {
        log.warn("resendSignupConfirmation", `Confirmation resend failed for ${safeEmail}: ${error.message}`, { email: safeEmail, errorCode: error.status }, error);
        void logAccountActivity("signup_confirmation_resend_failed", {
          email: safeEmail,
          errorMessage: error.message,
          errorCode: error.status,
        });

        const message = error.message.toLowerCase();
        if (message.includes("rate") || error.status === 429) {
          throw new Error("Too many verification email requests. Please wait a few minutes and try again.");
        }
        throw new Error("We could not resend the verification email right now. Please try again in a minute.");
      }

      log.info("resendSignupConfirmation", `Confirmation resend accepted for ${safeEmail}`, { email: safeEmail });
      void logAccountActivity("signup_confirmation_resend_succeeded", { email: safeEmail });
    });
  },

  async resetPassword(email: string, redirectTo: string, captchaToken?: string) {
    const parsedEmail = emailInputSchema.safeParse(email);
    if (!parsedEmail.success) throw blockedAuthInputError;
    const safeCaptchaToken = captchaToken?.trim();
    if (captchaToken !== undefined && !safeCaptchaToken) throw new Error("Complete the human verification before trying again.");
    const safeEmail = parsedEmail.data;
    const domainCheck = await validateEmailDomainExists(safeEmail);
    if (!domainCheck.valid) throw new Error(domainCheck.message ?? "Use an email address with a real domain.");
    return log.track("resetPassword", `Sending password reset for ${safeEmail}`, { email: safeEmail }, async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, {
        redirectTo,
        ...(safeCaptchaToken ? { captchaToken: safeCaptchaToken } : {}),
      });
      if (error) {
        log.warn("resetPassword", `Password reset request failed for ${safeEmail}: ${error.message}`, { email: safeEmail }, error);
        void logAccountActivity("password_reset_failed", { email: safeEmail, errorMessage: error.message, errorCode: error.status });
        if (error.status === 429 || error.message.toLowerCase().includes("too many rapid auth attempts")) throw createAuthThrottleCaptchaError();
        throw new Error("If an account exists with that email, a reset link has been sent.");
      }
      log.info("resetPassword", `Password reset email sent for ${safeEmail}`, { email: safeEmail });
      void logAccountActivity("password_reset_requested", { email: safeEmail });
    });
  },

  async updatePassword(newPassword: string) {
    return log.track("updatePassword", "Updating user password", undefined, async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        log.error("updatePassword", `Password update failed: ${error.message}`, { errorCode: error.status }, error);
        throw new Error("Failed to update password. Please try again.");
      }
      log.info("updatePassword", "Password updated successfully");
      void logAccountActivity("password_updated", {});
      await this.signOutAllDevices();
    });
  },

  async signOut() {
    log.info("signOut", "Signing out user");
    clearLocalAuthArtifacts();

    const { error } = await supabase.auth.signOut();
    if (!error) {
      log.info("signOut", "User signed out successfully (global)");
      void logAccountActivity("signout_global", {});
      return;
    }

    log.warn("signOut", `Global sign-out failed, falling back to local: ${error.message}`, undefined, error);
    const { error: localError } = await supabase.auth.signOut({ scope: "local" });
    if (localError) {
      log.error("signOut", `Local sign-out also failed: ${localError.message}`, undefined, localError);
      throw new Error("Sign out failed. Please try again.");
    }
    log.info("signOut", "User signed out successfully (local fallback)");
    void logAccountActivity("signout_local", { errorMessage: error.message });
  },

  clearLocalAuthState() {
    clearLocalAuthArtifacts();
  },

  async signOutAllDevices() {
    return log.track("signOutAllDevices", "Revoking all user sessions", undefined, async () => {
      const { error } = await supabase.functions.invoke("sign-out-all-devices");
      if (error) {
        log.error("signOutAllDevices", `Failed to revoke all sessions: ${error.message}`, undefined, error);
        throw new Error("Failed to revoke all sessions. Please try again.");
      }
      sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
      await supabase.auth.signOut();
      log.info("signOutAllDevices", "All sessions revoked and local session cleared");
      void logAccountActivity("signout_all_devices", {});
    });
  },

  async getSession() {
    log.debug("getSession", "Retrieving current session");
    if (isRootOAuthCallback() && !hasFreshOAuthUiMarker()) {
      log.warn("getSession", "Blocked direct OAuth callback without a recent UI-initiated sign-in marker");
      stripRootOAuthCallbackUrl();
      clearLocalAuthArtifacts();
      return null;
    }

    if (!hasStoredAuthSession()) {
      log.debug("getSession", "No stored auth session — skipping backend session check");
      return null;
    }

    let authResult: Awaited<ReturnType<typeof supabase.auth.getSession>>;
    try {
      authResult = await supabase.auth.getSession();
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await recoverFromInvalidRefreshToken(error, "getSession");
        return null;
      }
      throw error;
    }

    const { data, error } = authResult;
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        await recoverFromInvalidRefreshToken(error, "getSession");
        return null;
      }
      log.error("getSession", `Failed to retrieve session: ${error.message}`, undefined, error);
      throw new Error(error.message);
    }

    if (data.session) {
      let currentTokenIssuedAtMs = Date.now();
      // Server-side revocation check: if an admin or auto-detection revoked sessions
      // after this token was issued, force sign-out immediately.
      try {
        const issuedAt = new Date((data.session as { user: { created_at?: string } }).user.created_at ?? data.session.user.last_sign_in_at ?? new Date().toISOString());
        const tokenIssuedAt = data.session.expires_at
          ? new Date((data.session.expires_at - (data.session.expires_in ?? 600)) * 1000)
          : issuedAt;
        currentTokenIssuedAtMs = tokenIssuedAt.getTime();
        const { data: revoked } = await supabase.rpc("is_session_revoked", {
          _user_id: data.session.user.id,
          _issued_at: tokenIssuedAt.toISOString(),
        });
        if (revoked === true) {
          log.warn("getSession", `Session revoked server-side for user ${data.session.user.id} — forcing sign-out`);
          void logAccountActivity("session_revoked_serverside", { userId: data.session.user.id });
          await supabase.auth.signOut();
          sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
          return null;
        }
      } catch (e) {
        log.warn("getSession", `Revocation check failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
      }

      const marker = readSessionMarker(data.session);
      if (marker.resetReason) {
        writeSessionMarker(data.session);
        log.debug("getSession", "Session timestamp reset for current authenticated user", {
          userId: data.session.user.id,
          reason: marker.resetReason,
        });
        return data.session;
      }

      const elapsed = Date.now() - marker.startedAtMs;
      if (elapsed > MAX_SESSION_AGE_MS) {
        log.warn("getSession", `Session expired after ${Math.round(elapsed / 60000)} minutes — forcing sign-out`, {
          elapsedMs: elapsed,
          maxMs: MAX_SESSION_AGE_MS,
        });
        void logAccountActivity("session_expired_clientside", {
          userId: data.session.user.id,
          details: { elapsedMs: elapsed },
        });
        await supabase.auth.signOut();
        sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
        return null;
      }
      log.debug("getSession", "Valid session found", { userId: data.session.user.id });
      if (isRootOAuthCallback()) {
        clearOAuthUiMarker();
        stripRootOAuthCallbackUrl();
      }
    } else {
      log.debug("getSession", "No active session");
    }

    return data.session;
  },

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    log.debug("onAuthStateChange", "Subscribing to auth state changes");
    return supabase.auth.onAuthStateChange(callback);
  },
};

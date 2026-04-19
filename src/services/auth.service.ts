import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("AuthService");
const MAX_SESSION_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export const AuthService = {
  async signInWithPassword(email: string, password: string) {
    return log.track("signInWithPassword", `Authenticating user ${email}`, { email }, async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        log.error("signInWithPassword", `Authentication failed for ${email}: ${error.message}`, { email, errorCode: error.status }, error);
        throw new Error("Invalid email or password. Please try again.");
      }
      sessionStorage.setItem("session_started_at", Date.now().toString());
      log.info("signInWithPassword", `User ${email} authenticated successfully`, { userId: data.user?.id });
      return data;
    });
  },

  async signUp(email: string, password: string, firstName: string, lastName: string, redirectTo: string) {
    return log.track("signUp", `Registering new user ${email}`, { email, firstName, lastName }, async () => {
      const attempt = async () =>
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: `${firstName} ${lastName}`.trim(),
              first_name: firstName,
              last_name: lastName,
            },
            emailRedirectTo: redirectTo,
          },
        });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Sign-up request timed out. Please try again.")), 30_000)
      );

      // Auto-retry once on transient 5xx / network blips before surfacing.
      let lastErr: { message: string; status?: number; code?: string } | null = null;
      let data: any = null;
      for (let i = 0; i < 2; i++) {
        const res = await Promise.race([attempt(), timeoutPromise]);
        if (!res.error) { data = res.data; lastErr = null; break; }
        lastErr = { message: res.error.message, status: res.error.status, code: (res.error as any).code };
        const transient = !res.error.status || res.error.status >= 500 || res.error.status === 0;
        if (!transient) break;
        await new Promise(r => setTimeout(r, 600 * (i + 1)));
      }

      if (lastErr) {
        // Persist the REAL Supabase error so admins can diagnose, but surface a friendly mapped message to the user.
        log.error("signUp", `Registration failed for ${email}: [${lastErr.status ?? "?"}] ${lastErr.message}`,
          { email, errorCode: lastErr.status, errorName: lastErr.code }, lastErr as Error);

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

      log.info("signUp", `User ${email} registered successfully, confirmation email sent`, {
        userId: data?.user?.id,
        confirmationRequired: !data?.session,
      });
      return data;
    });
  },

  async resetPassword(email: string, redirectTo: string) {
    return log.track("resetPassword", `Sending password reset for ${email}`, { email }, async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        log.warn("resetPassword", `Password reset request failed for ${email}: ${error.message}`, { email }, error);
        throw new Error("If an account exists with that email, a reset link has been sent.");
      }
      log.info("resetPassword", `Password reset email sent for ${email}`, { email });
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
    });
  },

  async signOut() {
    log.info("signOut", "Signing out user");
    sessionStorage.removeItem("session_started_at");

    const { error } = await supabase.auth.signOut();
    if (!error) {
      log.info("signOut", "User signed out successfully (global)");
      return;
    }

    log.warn("signOut", `Global sign-out failed, falling back to local: ${error.message}`, undefined, error);
    const { error: localError } = await supabase.auth.signOut({ scope: "local" });
    if (localError) {
      log.error("signOut", `Local sign-out also failed: ${localError.message}`, undefined, localError);
      throw new Error("Sign out failed. Please try again.");
    }
    log.info("signOut", "User signed out successfully (local fallback)");
  },

  async signOutAllDevices() {
    return log.track("signOutAllDevices", "Revoking all user sessions", undefined, async () => {
      const { error } = await supabase.functions.invoke("sign-out-all-devices");
      if (error) {
        log.error("signOutAllDevices", `Failed to revoke all sessions: ${error.message}`, undefined, error);
        throw new Error("Failed to revoke all sessions. Please try again.");
      }
      sessionStorage.removeItem("session_started_at");
      await supabase.auth.signOut();
      log.info("signOutAllDevices", "All sessions revoked and local session cleared");
    });
  },

  async getSession() {
    log.debug("getSession", "Retrieving current session");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      log.error("getSession", `Failed to retrieve session: ${error.message}`, undefined, error);
      throw new Error(error.message);
    }

    if (data.session) {
      // Server-side revocation check: if an admin or auto-detection revoked sessions
      // after this token was issued, force sign-out immediately.
      try {
        const issuedAt = new Date((data.session as { user: { created_at?: string } }).user.created_at ?? data.session.user.last_sign_in_at ?? new Date().toISOString());
        const tokenIssuedAt = data.session.expires_at
          ? new Date((data.session.expires_at - (data.session.expires_in ?? 600)) * 1000)
          : issuedAt;
        const { data: revoked } = await supabase.rpc("is_session_revoked", {
          _user_id: data.session.user.id,
          _issued_at: tokenIssuedAt.toISOString(),
        });
        if (revoked === true) {
          log.warn("getSession", `Session revoked server-side for user ${data.session.user.id} — forcing sign-out`);
          await supabase.auth.signOut();
          sessionStorage.removeItem("session_started_at");
          return null;
        }
      } catch (e) {
        log.warn("getSession", `Revocation check failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
      }

      const startedAt = sessionStorage.getItem("session_started_at");
      if (startedAt) {
        const elapsed = Date.now() - parseInt(startedAt, 10);
        if (elapsed > MAX_SESSION_AGE_MS) {
          log.warn("getSession", `Session expired after ${Math.round(elapsed / 60000)} minutes — forcing sign-out`, {
            elapsedMs: elapsed,
            maxMs: MAX_SESSION_AGE_MS,
          });
          await supabase.auth.signOut();
          sessionStorage.removeItem("session_started_at");
          return null;
        }
      } else {
        sessionStorage.setItem("session_started_at", Date.now().toString());
        log.debug("getSession", "Session timestamp set (first access this tab)");
      }
      log.debug("getSession", "Valid session found", { userId: data.session.user.id });
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

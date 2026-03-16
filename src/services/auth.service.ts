import { supabase } from "@/integrations/supabase/client";

const MAX_SESSION_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export const AuthService = {
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error("Invalid email or password. Please try again.");
    }
    // Store login timestamp for session age enforcement
    sessionStorage.setItem("session_started_at", Date.now().toString());
    return data;
  },

  async signUp(email: string, password: string, firstName: string, lastName: string, redirectTo: string) {
    const { data, error } = await supabase.auth.signUp({
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
    if (error) {
      throw new Error("Unable to create account. Please try again or use a different email.");
    }
    return data;
  },

  async resetPassword(email: string, redirectTo: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      throw new Error("If an account exists with that email, a reset link has been sent.");
    }
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error("Failed to update password. Please try again.");
  },

  async signOut() {
    sessionStorage.removeItem("session_started_at");

    const { error } = await supabase.auth.signOut();
    if (!error) return;

    const { error: localError } = await supabase.auth.signOut({ scope: "local" });
    if (localError) throw new Error("Sign out failed. Please try again.");
  },

  async signOutAllDevices() {
    const { error } = await supabase.functions.invoke("sign-out-all-devices");
    if (error) throw new Error("Failed to revoke all sessions. Please try again.");
    sessionStorage.removeItem("session_started_at");
    await supabase.auth.signOut();
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);

    // Enforce 8-hour max session lifetime
    if (data.session) {
      const startedAt = sessionStorage.getItem("session_started_at");
      if (startedAt) {
        const elapsed = Date.now() - parseInt(startedAt, 10);
        if (elapsed > MAX_SESSION_AGE_MS) {
          await supabase.auth.signOut();
          sessionStorage.removeItem("session_started_at");
          return null;
        }
      } else {
        // Session exists but no timestamp — set it now (e.g., page refresh after OAuth)
        sessionStorage.setItem("session_started_at", Date.now().toString());
      }
    }

    return data.session;
  },

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback);
  },
};

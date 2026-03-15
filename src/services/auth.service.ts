import { supabase } from "@/integrations/supabase/client";

export const AuthService = {
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error("Invalid email or password. Please try again.");
    }
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
      // Generic message to prevent email enumeration
      throw new Error("If an account exists with that email, a reset link has been sent.");
    }
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error("Failed to update password. Please try again.");
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("Sign out failed. Please try again.");
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  },

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback);
  },
};

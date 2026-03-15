import { supabase } from "@/integrations/supabase/client";

export const AuthService = {
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // A07: Generic error message to prevent user enumeration
      throw new Error("Invalid email or password. Please try again.");
    }
    return data;
  },

  async signUp(email: string, password: string, fullName: string, redirectTo: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTo,
      },
    });
    if (error) {
      // A07: Generic error message to prevent user enumeration
      throw new Error("Unable to create account. Please try again or use a different email.");
    }
    return data;
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

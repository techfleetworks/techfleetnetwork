import { supabase } from "@/integrations/supabase/client";
import type { ProfileInput } from "@/lib/validators/profile";

export interface Profile {
  display_name: string;
  bio: string;
  professional_background: string;
  avatar_url: string | null;
  profile_completed: boolean;
}

export const ProfileService = {
  async fetch(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, bio, professional_background, avatar_url, profile_completed")
      .eq("user_id", userId)
      .single();
    if (error) return null;
    return data;
  },

  async update(userId: string, input: ProfileInput) {
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: input.displayName,
        bio: input.bio,
        professional_background: input.background,
        profile_completed: true,
      })
      .eq("user_id", userId);
    if (error) throw new Error("Failed to save profile. Please try again.");
  },
};

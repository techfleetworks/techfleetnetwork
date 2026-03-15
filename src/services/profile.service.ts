import { supabase } from "@/integrations/supabase/client";
import type { ProfileInput } from "@/lib/validators/profile";

export interface Profile {
  first_name: string;
  last_name: string;
  country: string;
  discord_username: string;
  display_name: string;
  avatar_url: string | null;
  profile_completed: boolean;
}

export const ProfileService = {
  async fetch(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("first_name, last_name, country, discord_username, display_name, avatar_url, profile_completed")
      .eq("user_id", userId)
      .single();
    if (error) return null;
    return data as unknown as Profile;
  },

  async update(userId: string, input: ProfileInput) {
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        country: input.country,
        discord_username: input.discordUsername,
        display_name: `${input.firstName} ${input.lastName}`,
        profile_completed: true,
      } as any)
      .eq("user_id", userId);
    if (error) throw new Error("Failed to save profile. Please try again.");
  },
};

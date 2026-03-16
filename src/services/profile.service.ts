import { supabase } from "@/integrations/supabase/client";
import type { ProfileInput } from "@/lib/validators/profile";
import { DiscordNotifyService } from "@/services/discord-notify.service";

export interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  discord_username: string;
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
  profile_completed: boolean;
  interests: string[];
}

export const ProfileService = {
  async fetch(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, country, discord_username, discord_user_id, display_name, avatar_url, profile_completed, interests")
      .eq("user_id", userId)
      .single();
    if (error) return null;
    return data as unknown as Profile;
  },

  async update(userId: string, input: ProfileInput) {
    // Resolve Discord user ID if username provided
    let discordUserId = "";
    if (input.discordUsername) {
      const resolved = await DiscordNotifyService.resolveDiscordId(input.discordUsername);
      if (resolved) discordUserId = resolved;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        country: input.country,
        discord_username: input.discordUsername || "",
        discord_user_id: discordUserId,
        display_name: `${input.firstName} ${input.lastName}`.trim(),
        interests: input.interests || [],
        profile_completed: true,
      } as any)
      .eq("user_id", userId);
    if (error) throw new Error("Failed to save profile. Please try again.");
  },

  /** Sync OAuth names and email to profile (used for Google sign-in) */
  async updateNames(userId: string, firstName: string, lastName: string, email?: string) {
    const updateData: Record<string, string> = {
      first_name: firstName,
      last_name: lastName,
      display_name: `${firstName} ${lastName}`.trim(),
    };
    if (email) updateData.email = email;

    const { error } = await supabase
      .from("profiles")
      .update(updateData as any)
      .eq("user_id", userId);
    if (error) throw new Error("Failed to sync profile names.");
  },
};

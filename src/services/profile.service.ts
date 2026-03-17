import { supabase } from "@/integrations/supabase/client";
import type { ProfileInput } from "@/lib/validators/profile";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { createLogger } from "@/services/logger.service";

const log = createLogger("ProfileService");

export interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  timezone: string;
  discord_username: string;
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
  profile_completed: boolean;
  interests: string[];
  portfolio_url: string;
  linkedin_url: string;
  experience_areas: string[];
  professional_goals: string;
  notify_training_opportunities: boolean;
  education_background: string[];
}

export const ProfileService = {
  async fetch(userId: string): Promise<Profile | null> {
    return log.track("fetch", `Fetching profile for user ${userId}`, { userId }, async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, country, timezone, discord_username, discord_user_id, display_name, avatar_url, profile_completed, interests, portfolio_url, linkedin_url, experience_areas, professional_goals, notify_training_opportunities, education_background")
        .eq("user_id", userId)
        .single();
      if (error) {
        log.warn("fetch", `Profile not found or query failed for user ${userId}: ${error.message}`, {
          userId,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
        }, error);
        return null;
      }
      log.info("fetch", `Profile loaded for user ${userId}`, {
        userId,
        profileCompleted: (data as any)?.profile_completed,
        hasDiscord: !!(data as any)?.discord_username,
      });
      return data as unknown as Profile;
    });
  },

  async update(userId: string, input: ProfileInput, email?: string) {
    return log.track("update", `Updating profile for user ${userId}`, {
      userId,
      fields: Object.keys(input),
      country: input.country,
      hasDiscord: !!input.discordUsername,
      interestCount: input.interests?.length ?? 0,
      hasEmail: !!email,
    }, async () => {
      let discordUserId = "";
      if (input.discordUsername) {
        log.info("update", `Resolving Discord ID for username "${input.discordUsername}"`, { userId, discordUsername: input.discordUsername });
        const resolved = await DiscordNotifyService.resolveDiscordId(input.discordUsername);
        if (resolved) {
          discordUserId = resolved;
          log.info("update", `Discord ID resolved: ${resolved}`, { userId, discordUserId: resolved });
        } else {
          log.warn("update", `Could not resolve Discord ID for "${input.discordUsername}" — user may not be in the server`, { userId, discordUsername: input.discordUsername });
        }
      }

      const updateData: Record<string, unknown> = {
        first_name: input.firstName,
        last_name: input.lastName,
        country: input.country,
        timezone: input.timezone,
        discord_username: input.discordUsername || "",
        discord_user_id: discordUserId,
        display_name: `${input.firstName} ${input.lastName}`.trim(),
        interests: input.interests || [],
        profile_completed: true,
      };

      if (email) {
        updateData.email = email;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData as any)
        .eq("user_id", userId);
      if (error) {
        log.error("update", `Failed to save profile for user ${userId}: ${error.message}`, {
          userId,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
        }, error);
        throw new Error("Failed to save profile. Please try again.");
      }
      log.info("update", `Profile saved successfully for user ${userId}`, { userId });
    });
  },

  async updateNames(userId: string, firstName: string, lastName: string, email?: string) {
    return log.track("updateNames", `Syncing OAuth names for user ${userId}`, {
      userId,
      firstName,
      lastName,
      hasEmail: !!email,
    }, async () => {
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
      if (error) {
        log.error("updateNames", `Failed to sync profile names for user ${userId}: ${error.message}`, {
          userId,
          errorCode: error.code,
          errorDetails: error.details,
        }, error);
        throw new Error("Failed to sync profile names.");
      }
      log.info("updateNames", `Profile names synced for user ${userId}`, { userId, firstName, lastName });
    });
  },

  /** Update arbitrary profile fields (used by general application to sync Section 2 fields) */
  async updateFields(userId: string, fields: Record<string, unknown>) {
    return log.track("updateFields", `Updating profile fields for user ${userId}`, {
      userId,
      fields: Object.keys(fields),
    }, async () => {
      const { error } = await supabase
        .from("profiles")
        .update(fields as any)
        .eq("user_id", userId);
      if (error) {
        log.error("updateFields", `Failed to update profile fields: ${error.message}`, { userId }, error);
        throw new Error("Failed to update profile.");
      }
      log.info("updateFields", `Profile fields updated for user ${userId}`, { userId });
    });
  },
};

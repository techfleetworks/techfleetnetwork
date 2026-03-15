import { supabase } from "@/integrations/supabase/client";

interface NotifyPayload {
  event:
    | "user_signed_up"
    | "profile_completed"
    | "task_completed"
    | "phase_completed"
    | "class_registered";
  display_name?: string;
  discord_username?: string;
  discord_user_id?: string;
  task_name?: string;
  phase_name?: string;
  class_name?: string;
  country?: string;
}

/** Fire-and-forget Discord notification — never throws */
async function notify(payload: NotifyPayload) {
  try {
    await supabase.functions.invoke("discord-notify", { body: payload });
  } catch {
    // Non-critical: don't block the user experience
  }
}

const TASK_LABELS: Record<string, string> = {
  profile: "Set Up Profile",
  "onboarding-class": "Complete Onboarding Class",
  "service-leadership": "Sign Up for Service Leadership Class",
  "user-guide": "Complete the Discord Tutorial Series",
  "figma-account": "Register for Figma Educational Account",
  "community-agreement": "Agree to the Community Member Agreement",
};

const PHASE_LABELS: Record<string, string> = {
  first_steps: "First Steps",
  second_steps: "Second Steps — Agile Handbook",
  third_steps: "Third Steps — Teammate Handbook",
  observer: "Observer Phase",
  projects: "Apply for Projects",
};

export const DiscordNotifyService = {
  userSignedUp(displayName: string, discordUsername?: string, discordUserId?: string) {
    notify({ event: "user_signed_up", display_name: displayName, discord_username: discordUsername, discord_user_id: discordUserId });
  },

  profileCompleted(displayName: string, country?: string, discordUsername?: string, discordUserId?: string) {
    notify({ event: "profile_completed", display_name: displayName, country, discord_username: discordUsername, discord_user_id: discordUserId });
  },

  taskCompleted(displayName: string, taskId: string, discordUsername?: string, discordUserId?: string) {
    notify({
      event: "task_completed",
      display_name: displayName,
      task_name: TASK_LABELS[taskId] || taskId,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  phaseCompleted(displayName: string, phase: string, discordUsername?: string, discordUserId?: string) {
    notify({
      event: "phase_completed",
      display_name: displayName,
      phase_name: PHASE_LABELS[phase] || phase,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  classRegistered(displayName: string, className: string, discordUsername?: string, discordUserId?: string) {
    notify({
      event: "class_registered",
      display_name: displayName,
      class_name: className,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  /** Resolve a Discord username to a numeric user ID via the bot */
  async resolveDiscordId(discordUsername: string): Promise<string | null> {
    try {
      const { data } = await supabase.functions.invoke("resolve-discord-id", {
        body: { discord_username: discordUsername },
      });
      return data?.discord_user_id || null;
    } catch {
      return null;
    }
  },
};

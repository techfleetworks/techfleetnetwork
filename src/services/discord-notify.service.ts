import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { discordBreaker } from "@/lib/circuit-breaker";

const log = createLogger("DiscordNotifyService");

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
    log.info("notify", `Sending Discord notification: ${payload.event}`, {
      event: payload.event,
      displayName: payload.display_name,
      discordUsername: payload.discord_username,
    });

    const { data, error } = await discordBreaker.executeWithFallback(
      () => supabase.functions.invoke("discord-notify", { body: payload }),
      { data: { success: false, reason: "circuit_open" }, error: null },
    );

    if (error) {
      throw error;
    }

    if (data?.success === false) {
      log.warn("notify", `Discord notification skipped for event "${payload.event}" — non-critical`, {
        event: payload.event,
        displayName: payload.display_name,
        reason: data?.reason,
        status: data?.status,
      });
      return;
    }

    log.info("notify", `Discord notification sent successfully: ${payload.event}`, { event: payload.event });
  } catch (err) {
    log.warn("notify", `Failed to send Discord notification for event "${payload.event}" — non-critical, continuing`, {
      event: payload.event,
      displayName: payload.display_name,
    }, err);
  }
}

const TASK_LABELS: Record<string, string> = {
  profile: "Set Up Profile",
  "onboarding-class": "Complete Onboarding Class",
  "service-leadership": "Sign Up for Service Leadership Class",
  
  "figma-account": "Register for Figma Educational Account",
  "community-agreement": "Agree to the Community Member Agreement",
};

const PHASE_LABELS: Record<string, string> = {
  first_steps: "Onboarding Steps",
  second_steps: "Build an Agile Mindset",
  third_steps: "Learn About Agile Teamwork",
  observer: "Observe Project Teams",
  projects: "Apply for Projects",
};

export const DiscordNotifyService = {
  userSignedUp(displayName: string, discordUsername?: string, discordUserId?: string) {
    log.info("userSignedUp", `New user signed up: ${displayName}`, { displayName, discordUsername });
    notify({ event: "user_signed_up", display_name: displayName, discord_username: discordUsername, discord_user_id: discordUserId });
  },

  profileCompleted(displayName: string, country?: string, discordUsername?: string, discordUserId?: string) {
    log.info("profileCompleted", `Profile completed by ${displayName}`, { displayName, country, discordUsername });
    notify({ event: "profile_completed", display_name: displayName, country, discord_username: discordUsername, discord_user_id: discordUserId });
  },

  taskCompleted(displayName: string, taskId: string, discordUsername?: string, discordUserId?: string) {
    const taskName = TASK_LABELS[taskId] || taskId;
    log.info("taskCompleted", `Task "${taskName}" completed by ${displayName}`, { displayName, taskId, taskName, discordUsername });
    notify({
      event: "task_completed",
      display_name: displayName,
      task_name: taskName,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  phaseCompleted(displayName: string, phase: string, discordUsername?: string, discordUserId?: string) {
    const phaseName = PHASE_LABELS[phase] || phase;
    log.info("phaseCompleted", `Phase "${phaseName}" completed by ${displayName}`, { displayName, phase, phaseName, discordUsername });
    notify({
      event: "phase_completed",
      display_name: displayName,
      phase_name: phaseName,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  classRegistered(displayName: string, className: string, discordUsername?: string, discordUserId?: string) {
    log.info("classRegistered", `Class "${className}" registered by ${displayName}`, { displayName, className, discordUsername });
    notify({
      event: "class_registered",
      display_name: displayName,
      class_name: className,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  async resolveDiscordId(discordUsername: string): Promise<string | null> {
    return log.track("resolveDiscordId", `Resolving Discord ID for "${discordUsername}"`, { discordUsername }, async () => {
      try {
        const { data } = await discordBreaker.execute(
          () => supabase.functions.invoke("resolve-discord-id", {
            body: { discord_username: discordUsername },
          }),
        );
        const result = data?.discord_user_id || null;
        if (result) {
          log.info("resolveDiscordId", `Resolved "${discordUsername}" to Discord ID ${result}`, { discordUsername, discordUserId: result });
        } else {
          log.warn("resolveDiscordId", `Could not resolve "${discordUsername}" — user not found in server`, { discordUsername });
        }
        return result;
      } catch (err) {
        log.warn("resolveDiscordId", `Error resolving Discord ID for "${discordUsername}" — returning null`, { discordUsername }, err);
        return null;
      }
    });
  },
};

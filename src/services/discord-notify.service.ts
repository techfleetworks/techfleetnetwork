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
    | "class_registered"
    | "application_submitted"
    | "project_applied"
    | "feedback_submitted"
    | "resource_explored"
    | "discord_verified";
  display_name?: string;
  discord_username?: string;
  discord_user_id?: string;
  task_name?: string;
  phase_name?: string;
  class_name?: string;
  country?: string;
  project_name?: string;
  application_type?: string;
  feedback_area?: string;
  search_query?: string;
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
  third_steps: "Agile Cross-Functional Team Dynamics",
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

  applicationSubmitted(displayName: string, applicationType: string, discordUsername?: string, discordUserId?: string) {
    log.info("applicationSubmitted", `${applicationType} application submitted by ${displayName}`, { displayName, applicationType, discordUsername });
    notify({
      event: "application_submitted",
      display_name: displayName,
      application_type: applicationType,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  projectApplied(displayName: string, projectName: string, discordUsername?: string, discordUserId?: string) {
    log.info("projectApplied", `Project application submitted by ${displayName} for "${projectName}"`, { displayName, projectName, discordUsername });
    notify({
      event: "project_applied",
      display_name: displayName,
      project_name: projectName,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  feedbackSubmitted(displayName: string, feedbackArea: string, discordUsername?: string, discordUserId?: string) {
    log.info("feedbackSubmitted", `Feedback submitted by ${displayName} about "${feedbackArea}"`, { displayName, feedbackArea, discordUsername });
    notify({
      event: "feedback_submitted",
      display_name: displayName,
      feedback_area: feedbackArea,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  resourceExplored(displayName: string, searchQuery: string, discordUsername?: string, discordUserId?: string) {
    log.info("resourceExplored", `Resources explored by ${displayName}: "${searchQuery}"`, { displayName, searchQuery, discordUsername });
    notify({
      event: "resource_explored",
      display_name: displayName,
      search_query: searchQuery,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  discordVerified(displayName: string, discordUsername: string, discordUserId: string) {
    log.info("discordVerified", `Discord verified by ${displayName}`, { displayName, discordUsername, discordUserId });
    notify({
      event: "discord_verified",
      display_name: displayName,
      discord_username: discordUsername,
      discord_user_id: discordUserId,
    });
  },

  async resolveDiscordId(discordUsername: string): Promise<{
    discord_user_id: string | null;
    avatar_url?: string | null;
    candidates?: Array<{
      id: string;
      username: string;
      global_name: string | null;
      nick: string | null;
      avatar: string | null;
    }>;
    message?: string;
  }> {
    return log.track("resolveDiscordId", `Resolving Discord ID for "${discordUsername}"`, { discordUsername }, async () => {
      try {
        const { data: rawData, error } = await discordBreaker.execute(
          () => supabase.functions.invoke("resolve-discord-id", {
            body: { discord_username: discordUsername },
          }),
        );

        if (error) {
          log.warn("resolveDiscordId", `Edge function error for "${discordUsername}": ${error.message}`, { discordUsername });
          return { discord_user_id: null };
        }

        // supabase.functions.invoke may return parsed JSON or a raw string
        const data = typeof rawData === "string" ? (() => { try { return JSON.parse(rawData); } catch { return rawData; } })() : rawData;

        const result = data?.discord_user_id || null;
        const candidates = Array.isArray(data?.candidates) ? data.candidates : undefined;

        if (result) {
          log.info("resolveDiscordId", `Resolved "${discordUsername}" to Discord ID ${result}`, { discordUsername, discordUserId: result });
        } else {
          log.warn("resolveDiscordId", `Could not resolve "${discordUsername}" — candidates: ${candidates?.length ?? 0}`, {
            discordUsername,
            candidateCount: candidates?.length ?? 0,
            rawDataType: typeof rawData,
          });
        }
        return {
          discord_user_id: result,
          avatar_url: data?.avatar_url || null,
          candidates,
          message: data?.message || undefined,
        };
      } catch (err) {
        log.warn("resolveDiscordId", `Error resolving Discord ID for "${discordUsername}" — returning null`, { discordUsername }, err);
        return { discord_user_id: null };
      }
    });
  },

  async confirmDiscordId(discordUserId: string): Promise<string | null> {
    return log.track("confirmDiscordId", `Confirming Discord ID ${discordUserId}`, { discordUserId }, async () => {
      try {
        const { data } = await discordBreaker.execute(
          () => supabase.functions.invoke("resolve-discord-id", {
            body: { confirm_user_id: discordUserId },
          }),
        );
        return data?.discord_user_id || null;
      } catch (err) {
        log.warn("confirmDiscordId", `Error confirming Discord ID ${discordUserId}`, { discordUserId }, err);
        return null;
      }
    });
  },
};
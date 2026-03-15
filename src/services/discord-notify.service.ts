import { supabase } from "@/integrations/supabase/client";

interface NotifyPayload {
  event:
    | "user_signed_up"
    | "profile_completed"
    | "task_completed"
    | "phase_completed"
    | "class_registered";
  display_name?: string;
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
  userSignedUp(displayName: string) {
    notify({ event: "user_signed_up", display_name: displayName });
  },

  profileCompleted(displayName: string, country?: string) {
    notify({ event: "profile_completed", display_name: displayName, country });
  },

  taskCompleted(displayName: string, taskId: string) {
    notify({
      event: "task_completed",
      display_name: displayName,
      task_name: TASK_LABELS[taskId] || taskId,
    });
  },

  phaseCompleted(displayName: string, phase: string) {
    notify({
      event: "phase_completed",
      display_name: displayName,
      phase_name: PHASE_LABELS[phase] || phase,
    });
  },

  classRegistered(displayName: string, className: string) {
    notify({
      event: "class_registered",
      display_name: displayName,
      class_name: className,
    });
  },
};

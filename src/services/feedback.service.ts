import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("FeedbackService");

export interface Feedback {
  id: string;
  user_id: string;
  user_email: string;
  system_area: string;
  message: string;
  created_at: string;
}

export const FEEDBACK_AREAS = [
  "Activity Log",
  "Alerts",
  "Applications",
  "Courses",
  "Dashboard",
  "Events",
  "Fleety",
  "Preferences",
  "Profile",
  "Project Openings",
  "Projects and Courses",
  "Resources",
  "Updates",
  "User Admin",
] as const;

export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];

export const FeedbackService = {
  async submit(userId: string, email: string, systemArea: string, message: string): Promise<boolean> {
    const { error } = await supabase
      .from("feedback" as any)
      .insert({ user_id: userId, user_email: email, system_area: systemArea, message } as any);

    if (error) {
      log.warn("submit", `Failed to submit feedback: ${error.message}`, { userId }, error);
      return false;
    }
    return true;
  },

  async listAll(): Promise<Feedback[]> {
    const { data, error } = await supabase
      .from("feedback" as any)
      .select("id, user_id, user_email, system_area, message, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      log.warn("listAll", `Failed to list feedback: ${error.message}`, {}, error);
      return [];
    }
    return (data as unknown as Feedback[]) || [];
  },
};

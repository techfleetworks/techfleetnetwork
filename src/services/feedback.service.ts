import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { emailInputSchema } from "@/lib/validators/auth";
import { safeLongTextSchema } from "@/lib/validators/shared-input";
import { z } from "zod";

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
  "Surveys",
  "Community Updates",
  "User Admin",
] as const;

export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];

const feedbackSchema = z.object({
  email: emailInputSchema,
  systemArea: z.enum(FEEDBACK_AREAS),
  message: safeLongTextSchema("Feedback", 5000).min(1, "Feedback is required"),
});

export const FeedbackService = {
  async submit(userId: string, email: string, systemArea: string, message: string): Promise<boolean> {
    try {
      const parsed = feedbackSchema.safeParse({ email, systemArea, message });
      if (!parsed.success) return false;
      const { error } = await supabase
        .from("feedback")
        .insert({ user_id: userId, user_email: parsed.data.email, system_area: parsed.data.systemArea, message: parsed.data.message });

      if (error) {
        log.warn("submit", `Failed to submit feedback: ${error.message} (code: ${error.code}, details: ${error.details}, hint: ${error.hint})`, { userId }, error);
        return false;
      }
      return true;
    } catch (err) {
      log.warn("submit", `Unexpected error submitting feedback: ${err instanceof Error ? err.message : String(err)}`, { userId });
      return false;
    }
  },

  async listAll(): Promise<Feedback[]> {
    const { data, error } = await supabase
      .from("feedback")
      .select("id, user_id, user_email, system_area, message, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      log.warn("listAll", `Failed to list feedback: ${error.message}`, {}, error);
      return [];
    }
    return (data as unknown as Feedback[]) || [];
  },
};

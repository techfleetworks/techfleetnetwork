import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type JourneyPhase = Database["public"]["Enums"]["journey_phase"];

export interface TaskProgress {
  task_id: string;
  completed: boolean;
}

// A03: Whitelist valid task IDs to prevent injection
const VALID_TASK_IDS = new Set([
  "profile",
  "onboarding-class",
  "service-leadership",
  "user-guide",
]);

const VALID_PHASES: Set<string> = new Set([
  "first_steps",
  "second_steps",
  "third_steps",
  "observer",
  "projects",
]);

export const JourneyService = {
  async getProgress(userId: string, phase: JourneyPhase): Promise<TaskProgress[]> {
    if (!VALID_PHASES.has(phase)) throw new Error("Invalid phase");

    const { data, error } = await supabase
      .from("journey_progress")
      .select("task_id, completed")
      .eq("user_id", userId)
      .eq("phase", phase);
    if (error) throw new Error("Failed to load progress");
    return data ?? [];
  },

  async getCompletedCount(userId: string, phase: JourneyPhase): Promise<number> {
    if (!VALID_PHASES.has(phase)) throw new Error("Invalid phase");

    const { data } = await supabase
      .from("journey_progress")
      .select("task_id")
      .eq("user_id", userId)
      .eq("phase", phase)
      .eq("completed", true);
    return data?.length ?? 0;
  },

  async upsertTask(userId: string, phase: JourneyPhase, taskId: string, completed: boolean) {
    // A03: Validate inputs against whitelists
    if (!VALID_PHASES.has(phase)) throw new Error("Invalid phase");
    if (!VALID_TASK_IDS.has(taskId)) throw new Error("Invalid task ID");

    const { error } = await supabase.from("journey_progress").upsert(
      {
        user_id: userId,
        phase,
        task_id: taskId,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,phase,task_id" }
    );
    if (error) throw new Error("Failed to update progress");
  },
};

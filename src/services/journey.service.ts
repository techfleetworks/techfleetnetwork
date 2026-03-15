import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type JourneyPhase = Database["public"]["Enums"]["journey_phase"];

export interface TaskProgress {
  task_id: string;
  completed: boolean;
}

export const JourneyService = {
  async getProgress(userId: string, phase: JourneyPhase): Promise<TaskProgress[]> {
    const { data, error } = await supabase
      .from("journey_progress")
      .select("task_id, completed")
      .eq("user_id", userId)
      .eq("phase", phase);
    if (error) throw new Error("Failed to load progress");
    return data ?? [];
  },

  async getCompletedCount(userId: string, phase: JourneyPhase): Promise<number> {
    const { data } = await supabase
      .from("journey_progress")
      .select("task_id")
      .eq("user_id", userId)
      .eq("phase", phase)
      .eq("completed", true);
    return data?.length ?? 0;
  },

  async upsertTask(userId: string, phase: JourneyPhase, taskId: string, completed: boolean) {
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

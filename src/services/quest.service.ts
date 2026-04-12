import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("QuestService");

export interface QuestPath {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: string;
  icon: string;
  sort_order: number;
  estimated_duration: string;
  duration_phases: { label: string; duration: string }[];
  prerequisites: string[];
}

export interface QuestPathStep {
  id: string;
  path_id: string;
  title: string;
  description: string;
  step_type: "course" | "self_report" | "system_verified" | "application";
  sort_order: number;
  linked_phase: string | null;
  linked_table: string | null;
  linked_filter: Record<string, unknown> | null;
}

export interface UserQuestSelection {
  id: string;
  user_id: string;
  path_id: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export const QuestService = {
  async getPaths(): Promise<QuestPath[]> {
    return log.track("getPaths", "Loading all quest paths", {}, async () => {
      const { data, error } = await supabase
        .from("quest_paths")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) {
        log.error("getPaths", error.message, {}, error);
        throw new Error("Failed to load quest paths");
      }
      return (data ?? []).map((p) => ({
        ...p,
        duration_phases: (p.duration_phases as { label: string; duration: string }[]) ?? [],
        prerequisites: p.prerequisites ?? [],
      }));
    });
  },

  async getSteps(pathId: string): Promise<QuestPathStep[]> {
    return log.track("getSteps", `Loading steps for path ${pathId}`, { pathId }, async () => {
      const { data, error } = await supabase
        .from("quest_path_steps")
        .select("*")
        .eq("path_id", pathId)
        .order("sort_order", { ascending: true });
      if (error) {
        log.error("getSteps", error.message, { pathId }, error);
        throw new Error("Failed to load path steps");
      }
      return (data ?? []).map((s) => ({
        ...s,
        step_type: s.step_type as QuestPathStep["step_type"],
        linked_filter: s.linked_filter as Record<string, unknown> | null,
      }));
    });
  },

  async getAllSteps(): Promise<QuestPathStep[]> {
    return log.track("getAllSteps", "Loading all quest steps", {}, async () => {
      const { data, error } = await supabase
        .from("quest_path_steps")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) {
        log.error("getAllSteps", error.message, {}, error);
        throw new Error("Failed to load all steps");
      }
      return (data ?? []).map((s) => ({
        ...s,
        step_type: s.step_type as QuestPathStep["step_type"],
        linked_filter: s.linked_filter as Record<string, unknown> | null,
      }));
    });
  },

  async getUserSelections(userId: string): Promise<UserQuestSelection[]> {
    return log.track("getUserSelections", "Loading user quest selections", { userId }, async () => {
      const { data, error } = await supabase
        .from("user_quest_selections")
        .select("*")
        .eq("user_id", userId);
      if (error) {
        log.error("getUserSelections", error.message, { userId }, error);
        throw new Error("Failed to load quest selections");
      }
      return data ?? [];
    });
  },

  async addPath(userId: string, pathId: string): Promise<void> {
    return log.track("addPath", `Adding path ${pathId}`, { userId, pathId }, async () => {
      const { error } = await supabase.from("user_quest_selections").insert({
        user_id: userId,
        path_id: pathId,
        started_at: new Date().toISOString(),
      });
      if (error) {
        log.error("addPath", error.message, { userId, pathId }, error);
        throw new Error("Failed to add path");
      }
    });
  },

  async removePath(userId: string, pathId: string): Promise<void> {
    return log.track("removePath", `Removing path ${pathId}`, { userId, pathId }, async () => {
      const { error } = await supabase
        .from("user_quest_selections")
        .delete()
        .eq("user_id", userId)
        .eq("path_id", pathId);
      if (error) {
        log.error("removePath", error.message, { userId, pathId }, error);
        throw new Error("Failed to remove path");
      }
    });
  },

  async completeSelfReportStep(userId: string, stepId: string, completed: boolean): Promise<void> {
    // Self-report steps are stored as journey_progress with phase = 'quest_self_report'
    // We use the step UUID as the task_id
    return log.track("completeSelfReportStep", `${completed ? "Completing" : "Uncompleting"} step ${stepId}`, { userId, stepId }, async () => {
      const { error } = await supabase.from("journey_progress").upsert(
        {
          user_id: userId,
          phase: "first_steps" as const, // Using first_steps as fallback since quest phases aren't in enum yet
          task_id: `quest-step-${stepId}`,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,phase,task_id" }
      );
      if (error) {
        log.error("completeSelfReportStep", error.message, { userId, stepId }, error);
        throw new Error("Failed to update step progress");
      }
    });
  },

  async getSelfReportProgress(userId: string): Promise<Map<string, boolean>> {
    return log.track("getSelfReportProgress", "Loading self-report progress", { userId }, async () => {
      const { data, error } = await supabase
        .from("journey_progress")
        .select("task_id, completed")
        .eq("user_id", userId)
        .like("task_id", "quest-step-%");
      if (error) {
        log.error("getSelfReportProgress", error.message, { userId }, error);
        throw new Error("Failed to load self-report progress");
      }
      const map = new Map<string, boolean>();
      for (const row of data ?? []) {
        const stepId = row.task_id.replace("quest-step-", "");
        map.set(stepId, row.completed);
      }
      return map;
    });
  },
};

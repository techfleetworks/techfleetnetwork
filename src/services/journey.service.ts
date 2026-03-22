import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createLogger } from "@/services/logger.service";

const log = createLogger("JourneyService");

type JourneyPhase = Database["public"]["Enums"]["journey_phase"];

export interface TaskProgress {
  task_id: string;
  completed: boolean;
}

// A03: Whitelist valid task IDs to prevent injection
import { ALL_AGILE_LESSON_IDS } from "@/data/agile-course";
import { ALL_TEAMWORK_LESSON_IDS } from "@/data/teamwork-course";
import { ALL_PROJECT_TRAINING_LESSON_IDS } from "@/data/project-training-course";
import { ALL_VOLUNTEER_LESSON_IDS } from "@/data/volunteer-teams-course";
import { ALL_DISCORD_LESSON_IDS } from "@/data/discord-course";

const VALID_TASK_IDS = new Set([
  "profile",
  "join-discord",
  "onboarding-class",
  "service-leadership",
  "user-guide",
  "figma-account",
  "community-agreement",
  "privacy-policy",
  "terms-conditions",
  ...ALL_AGILE_LESSON_IDS,
  ...ALL_TEAMWORK_LESSON_IDS,
  ...ALL_PROJECT_TRAINING_LESSON_IDS,
  ...ALL_VOLUNTEER_LESSON_IDS,
  ...ALL_DISCORD_LESSON_IDS,
]);

const VALID_PHASES: Set<string> = new Set([
  "first_steps",
  "second_steps",
  "third_steps",
  "observer",
  "projects",
  "project_training",
  "volunteer",
  "discord_learning",
]);

export const JourneyService = {
  async getProgress(userId: string, phase: JourneyPhase): Promise<TaskProgress[]> {
    if (!VALID_PHASES.has(phase)) {
      log.error("getProgress", `Invalid phase "${phase}" requested`, { userId, phase });
      throw new Error("Invalid phase");
    }

    return log.track("getProgress", `Loading ${phase} progress for user ${userId}`, { userId, phase }, async () => {
      const { data, error } = await supabase
        .from("journey_progress")
        .select("task_id, completed")
        .eq("user_id", userId)
        .eq("phase", phase);
      if (error) {
        log.error("getProgress", `Database query failed for ${phase} progress: ${error.message}`, {
          userId,
          phase,
          errorCode: error.code,
          errorDetails: error.details,
        }, error);
        throw new Error("Failed to load progress");
      }
      const completedCount = data?.filter((t) => t.completed).length ?? 0;
      log.info("getProgress", `Loaded ${data?.length ?? 0} tasks (${completedCount} completed) for ${phase}`, {
        userId,
        phase,
        totalTasks: data?.length ?? 0,
        completedCount,
      });
      return data ?? [];
    });
  },

  async getCompletedCount(userId: string, phase: JourneyPhase): Promise<number> {
    if (!VALID_PHASES.has(phase)) {
      log.error("getCompletedCount", `Invalid phase "${phase}" requested`, { userId, phase });
      throw new Error("Invalid phase");
    }

    return log.track("getCompletedCount", `Counting completed ${phase} tasks for user ${userId}`, { userId, phase }, async () => {
      const { data } = await supabase
        .from("journey_progress")
        .select("task_id")
        .eq("user_id", userId)
        .eq("phase", phase)
        .eq("completed", true);
      const count = data?.length ?? 0;
      log.debug("getCompletedCount", `User ${userId} has ${count} completed tasks in ${phase}`, { userId, phase, count });
      return count;
    });
  },

  async upsertTask(userId: string, phase: JourneyPhase, taskId: string, completed: boolean) {
    // A03: Validate inputs against whitelists
    if (!VALID_PHASES.has(phase)) {
      log.error("upsertTask", `Invalid phase "${phase}" — rejecting upsert`, { userId, phase, taskId });
      throw new Error("Invalid phase");
    }
    if (!VALID_TASK_IDS.has(taskId)) {
      log.error("upsertTask", `Invalid task ID "${taskId}" — rejecting upsert (possible injection attempt)`, { userId, phase, taskId });
      throw new Error("Invalid task ID");
    }

    return log.track("upsertTask", `${completed ? "Completing" : "Uncompleting"} task "${taskId}" in ${phase}`, {
      userId,
      phase,
      taskId,
      completed,
    }, async () => {
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
      if (error) {
        log.error("upsertTask", `Failed to upsert task "${taskId}" for user ${userId}: ${error.message}`, {
          userId,
          phase,
          taskId,
          completed,
          errorCode: error.code,
          errorDetails: error.details,
        }, error);
        throw new Error("Failed to update progress");
      }
      log.info("upsertTask", `Task "${taskId}" ${completed ? "completed" : "uncompleted"} for user ${userId} in ${phase}`, {
        userId,
        phase,
        taskId,
        completed,
      });
    });
  },
};

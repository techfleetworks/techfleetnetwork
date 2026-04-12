import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, Lock, ArrowRight, Plus, Eye, BookOpen,
  Rocket, Map, Shield, BarChart2, Zap, Briefcase, Heart,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQuestPaths,
  useAllQuestSteps,
  useUserQuestSelections,
  useSelfReportProgress,
} from "@/hooks/use-quest";
import { useJourneyProgress } from "@/hooks/use-journey-progress";
import { cn } from "@/lib/utils";
import { QuestPathDetail } from "./QuestPathDetail";
import { QuestExploreDialog } from "./QuestExploreDialog";
import type { QuestPathStep } from "@/services/quest.service";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  rocket: Rocket, map: Map, eye: Eye, "book-open": BookOpen,
  shield: Shield, "bar-chart-2": BarChart2, zap: Zap,
  briefcase: Briefcase, heart: Heart, circle: Circle,
};

interface QuestRoadmapProps {
  onNeedIntake: () => void;
}

export function QuestRoadmap({ onNeedIntake }: QuestRoadmapProps) {
  const { user, profile } = useAuth();
  const { data: paths, isLoading: pathsLoading } = useQuestPaths();
  const { data: allSteps } = useAllQuestSteps();
  const { data: selections, isLoading: selectionsLoading } = useUserQuestSelections();
  const { data: selfReportProgress } = useSelfReportProgress();
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [showExplore, setShowExplore] = useState(false);

  // Load journey progress for all phases to compute course step completion
  const { data: firstStepsProgress } = useJourneyProgress(user?.id, "first_steps");
  const { data: secondStepsProgress } = useJourneyProgress(user?.id, "second_steps");
  const { data: thirdStepsProgress } = useJourneyProgress(user?.id, "third_steps");
  const { data: observerProgress } = useJourneyProgress(user?.id, "observer");
  const { data: discordProgress } = useJourneyProgress(user?.id, "discord_learning");
  const { data: projectTrainingProgress } = useJourneyProgress(user?.id, "project_training");
  const { data: volunteerProgress } = useJourneyProgress(user?.id, "volunteer");

  const allProgress = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    const progressArrays: { phase: string; data: { task_id: string; completed: boolean }[] | undefined }[] = [
      { phase: "first_steps", data: firstStepsProgress },
      { phase: "second_steps", data: secondStepsProgress },
      { phase: "third_steps", data: thirdStepsProgress },
      { phase: "observer", data: observerProgress },
      { phase: "discord_learning", data: discordProgress },
      { phase: "project_training", data: projectTrainingProgress },
      { phase: "volunteer", data: volunteerProgress },
    ];
    for (const { phase, data } of progressArrays) {
      if (data) {
        const completed = data.filter((t) => t.completed).length;
        map.set(phase, { completed, total: data.length });
      }
    }
    return map;
  }, [firstStepsProgress, secondStepsProgress, thirdStepsProgress, observerProgress, discordProgress, projectTrainingProgress, volunteerProgress]);

  // Compute step completion for each path
  const pathProgress = useMemo(() => {
    if (!paths || !allSteps || !selections) return new Map<string, { completed: number; total: number; nextStep?: QuestPathStep }>();
    
    const result = new Map<string, { completed: number; total: number; nextStep?: QuestPathStep }>();

    for (const path of paths) {
      const steps = allSteps.filter((s) => s.path_id === path.id);
      let completed = 0;
      let nextStep: QuestPathStep | undefined;

      for (const step of steps) {
        const isComplete = isStepCompleted(step, allProgress, selfReportProgress, profile);
        if (isComplete) {
          completed++;
        } else if (!nextStep) {
          nextStep = step;
        }
      }

      result.set(path.id, { completed, total: steps.length, nextStep });
    }

    return result;
  }, [paths, allSteps, selections, allProgress, selfReportProgress, profile]);

  // Check which paths are completed (for prerequisite checking)
  const completedPathSlugs = useMemo(() => {
    if (!paths) return new Set<string>();
    const set = new Set<string>();
    for (const path of paths) {
      const progress = pathProgress.get(path.id);
      if (progress && progress.completed >= progress.total && progress.total > 0) {
        set.add(path.slug);
      }
    }
    return set;
  }, [paths, pathProgress]);

  if (pathsLoading || selectionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selections || selections.length === 0) {
    onNeedIntake();
    return null;
  }

  // Get selected paths in order
  const selectedPaths = paths
    ?.filter((p) => selections.some((s) => s.path_id === p.id))
    .sort((a, b) => a.sort_order - b.sort_order) ?? [];

  const unselectedCount = (paths?.length ?? 0) - selectedPaths.length;

  if (selectedPathId) {
    const path = paths?.find((p) => p.id === selectedPathId);
    if (path) {
      return (
        <QuestPathDetail
          path={path}
          onBack={() => setSelectedPathId(null)}
          allProgress={allProgress}
          selfReportProgress={selfReportProgress}
          completedPathSlugs={completedPathSlugs}
          allPaths={paths ?? []}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Your Journey Roadmap</h2>
        {unselectedCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowExplore(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Explore More Paths ({unselectedCount} available)
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {selectedPaths.map((path, index) => {
          const progress = pathProgress.get(path.id);
          const prereqsMet = path.prerequisites.every((slug) => completedPathSlugs.has(slug));
          const isCompleted = progress && progress.completed >= progress.total && progress.total > 0;
          const isLocked = !prereqsMet;

          const Icon = ICON_MAP[path.icon] ?? Circle;

          return (
            <div key={path.id}>
              <button
                onClick={() => !isLocked && setSelectedPathId(path.id)}
                disabled={isLocked}
                className={cn(
                  "w-full card-elevated p-5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
                  isCompleted
                    ? "border-success/30 bg-success/5"
                    : isLocked
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:shadow-md hover:border-primary/30 cursor-pointer"
                )}
                aria-label={`${path.title}: ${progress?.completed ?? 0} of ${progress?.total ?? 0} steps completed, ${
                  isCompleted ? "completed" : isLocked ? "locked" : "in progress"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                    isCompleted ? "bg-success/10" : isLocked ? "bg-muted" : "bg-primary/10"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : isLocked ? (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Icon className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{path.title}</h3>
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        isCompleted
                          ? "bg-success/10 text-success"
                          : isLocked
                          ? "bg-muted text-muted-foreground"
                          : progress && progress.completed > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {isCompleted ? "Completed" : isLocked ? "Locked" : progress && progress.completed > 0 ? "In Progress" : "Not Started"}
                      </span>
                    </div>

                    {isLocked ? (
                      <p className="text-sm text-muted-foreground">
                        Requires: {path.prerequisites.map((slug) => paths?.find((p) => p.slug === slug)?.title ?? slug).join(", ")}
                      </p>
                    ) : isCompleted ? (
                      <p className="text-sm text-muted-foreground">All steps complete</p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {progress?.completed ?? 0} of {progress?.total ?? 0} steps complete
                        </p>
                        {progress?.nextStep && (
                          <p className="text-sm text-muted-foreground/70 mt-1">
                            Next: {progress.nextStep.title}
                          </p>
                        )}
                      </>
                    )}

                    <div className="mt-2">
                      <Progress
                        value={progress ? (progress.completed / Math.max(progress.total, 1)) * 100 : 0}
                        className="h-2"
                        aria-valuenow={progress?.completed ?? 0}
                        aria-valuemax={progress?.total ?? 0}
                      />
                    </div>
                  </div>

                  {!isLocked && (
                    <div className="flex-shrink-0 flex items-center gap-2 mt-1">
                      {!isCompleted && progress && progress.completed > 0 && (
                        <Button variant="ghost" size="sm" className="text-primary" tabIndex={-1}>
                          Continue <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                      {!isCompleted && progress && progress.completed === 0 && (
                        <Button variant="ghost" size="sm" className="text-primary" tabIndex={-1}>
                          Begin <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </button>

              {/* Connector line between cards */}
              {index < selectedPaths.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-0.5 h-4 bg-border" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <QuestExploreDialog
        open={showExplore}
        onOpenChange={setShowExplore}
        selectedPathIds={selections?.map((s) => s.path_id) ?? []}
        completedPathSlugs={completedPathSlugs}
      />
    </div>
  );
}

/** Determines if a single step is completed based on its type */
export function isStepCompleted(
  step: QuestPathStep,
  courseProgress: Map<string, { completed: number; total: number }>,
  selfReportProgress: Map<string, boolean> | undefined,
  profile: { discord_username?: string; profile_completed?: boolean } | null,
): boolean {
  switch (step.step_type) {
    case "course": {
      if (!step.linked_phase) return false;
      const progress = courseProgress.get(step.linked_phase);
      // Consider complete if user has completed tasks in this phase
      // We need to know the total lessons — for now use a heuristic
      return (progress?.completed ?? 0) > 0 && progress?.total === progress?.completed;
    }
    case "self_report":
      return selfReportProgress?.get(step.id) ?? false;
    case "system_verified": {
      if (step.linked_table === "profiles") {
        const filter = step.linked_filter as Record<string, unknown> | null;
        if (filter?.field === "profile_completed") return !!profile?.profile_completed;
        if (filter?.field === "discord_username" && filter?.not_empty) return !!profile?.discord_username;
        if (filter?.auto_after_step) return false; // Would need prev step check
      }
      return false;
    }
    case "application":
      // Would need to check general_applications / project_applications
      // For now, return false — will be enhanced
      return false;
    default:
      return false;
  }
}

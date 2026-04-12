import { useMemo, memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, Circle, Lock, Plus, Eye, BookOpen,
  Rocket, Map as MapIcon, Shield, BarChart2, Zap, Briefcase, Heart,
  Compass,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQuestPaths,
  useAllQuestSteps,
  useUserQuestSelections,
  useSelfReportProgress,
  useAllJourneyProgress,
} from "@/hooks/use-quest";
import { cn } from "@/lib/utils";
import { QuestPreviewDialog } from "./QuestPreviewDialog";
import { QuestPickerDialog } from "./QuestPickerDialog";
import { isStepCompleted } from "./QuestRoadmap";
import type { QuestPath, QuestPathStep } from "@/services/quest.service";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  rocket: Rocket, map: MapIcon, eye: Eye, "book-open": BookOpen,
  shield: Shield, "bar-chart-2": BarChart2, zap: Zap,
  briefcase: Briefcase, heart: Heart, circle: Circle,
};

/** Only these three slugs are shown to users as selectable quests */
const FEATURED_SLUGS = ["client-projects", "learn-skills", "volunteer"] as const;

export function QuestOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: paths, isLoading: pathsLoading } = useQuestPaths();
  const { data: allSteps } = useAllQuestSteps();
  const { data: selections, isLoading: selectionsLoading } = useUserQuestSelections();
  const { data: selfReportProgress } = useSelfReportProgress();
  const { data: allJourneyMap } = useAllJourneyProgress();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewPathId, setPreviewPathId] = useState<string | null>(null);

  const allProgress = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    if (!allJourneyMap) return map;
    for (const [phase, tasks] of allJourneyMap.entries()) {
      const completed = tasks.filter((t) => t.completed).length;
      map.set(phase, { completed, total: tasks.length });
    }
    return map;
  }, [allJourneyMap]);

  const pathProgress = useMemo(() => {
    const result = new Map<string, { completed: number; total: number; nextStep?: QuestPathStep }>();
    if (!paths || !allSteps) return result;
    for (const path of paths) {
      const steps = allSteps.filter((s) => s.path_id === path.id);
      let completed = 0;
      let nextStep: QuestPathStep | undefined;
      for (const step of steps) {
        if (isStepCompleted(step, allProgress, selfReportProgress, profile)) {
          completed++;
        } else if (!nextStep) {
          nextStep = step;
        }
      }
      result.set(path.id, { completed, total: steps.length, nextStep });
    }
    return result;
  }, [paths, allSteps, allProgress, selfReportProgress, profile]);

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

  const selectedPaths = useMemo(() => {
    if (!paths || !selections) return [];
    return paths
      .filter((p) => selections.some((s) => s.path_id === p.id))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [paths, selections]);

  const selectedPathIds = useMemo(() => selectedPaths.map((p) => p.id), [selectedPaths]);

  /** Featured quests not yet subscribed */
  const featuredAvailable = useMemo(() => {
    if (!paths || !selections) return [];
    return paths
      .filter((p) => FEATURED_SLUGS.includes(p.slug as typeof FEATURED_SLUGS[number]))
      .filter((p) => !selections.some((s) => s.path_id === p.id));
  }, [paths, selections]);

  const handleCardClick = useCallback((id: string) => {
    navigate(`/my-journey/quest/${id}`);
  }, [navigate]);

  if (pathsLoading || selectionsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading quests">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with add-quest button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Quests</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedPaths.length === 0
              ? "Start your first quest to begin your journey."
              : `${selectedPaths.length} active quest${selectedPaths.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {featuredAvailable.length > 0 && (
          <Button onClick={() => setPickerOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Start a Quest
          </Button>
        )}
      </div>

      {/* Empty state */}
      {selectedPaths.length === 0 && (
        <div className="text-center py-16 card-elevated rounded-lg">
          <Compass className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No quests yet</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mb-6">
            Choose a quest to get started. Each quest guides you through a hands-on learning experience.
          </p>
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Pick Your First Quest
          </Button>
        </div>
      )}

      {/* Subscribed quests grid */}
      {selectedPaths.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Your subscribed quests">
          {selectedPaths.map((path) => (
            <SubscribedQuestCard
              key={path.id}
              path={path}
              progress={pathProgress.get(path.id)}
              completedPathSlugs={completedPathSlugs}
              allPaths={paths ?? []}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}

      {/* Picker dialog — pick ONE quest at a time */}
      <QuestPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedPathIds={selectedPathIds}
        completedPathSlugs={completedPathSlugs}
        onPreview={(id) => {
          setPickerOpen(false);
          setPreviewPathId(id);
        }}
      />

      {/* Preview + opt-in dialog */}
      {previewPathId && (
        <QuestPreviewDialog
          open={!!previewPathId}
          onOpenChange={(open) => !open && setPreviewPathId(null)}
          pathId={previewPathId}
          completedPathSlugs={completedPathSlugs}
        />
      )}
    </div>
  );
}

/** Card for a quest the user is subscribed to — clicking navigates to detail page */
const SubscribedQuestCard = memo(function SubscribedQuestCard({
  path,
  progress,
  completedPathSlugs,
  allPaths,
  onClick,
}: {
  path: QuestPath;
  progress: { completed: number; total: number; nextStep?: QuestPathStep } | undefined;
  completedPathSlugs: Set<string>;
  allPaths: QuestPath[];
  onClick: (id: string) => void;
}) {
  const prereqsMet = path.prerequisites.every((slug) => completedPathSlugs.has(slug));
  const isCompleted = progress && progress.completed >= progress.total && progress.total > 0;
  const isLocked = !prereqsMet;
  const Icon = ICON_MAP[path.icon] ?? Circle;
  const pct = progress ? (progress.completed / Math.max(progress.total, 1)) * 100 : 0;

  return (
    <button
      role="listitem"
      onClick={() => !isLocked && onClick(path.id)}
      disabled={isLocked}
      className={cn(
        "card-elevated p-5 text-left transition-all duration-200 rounded-lg w-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isCompleted
          ? "border-success/30 bg-success/5"
          : isLocked
          ? "opacity-60 cursor-not-allowed"
          : "hover:shadow-md hover:border-primary/30 cursor-pointer"
      )}
      aria-label={`${path.title}: ${progress?.completed ?? 0} of ${progress?.total ?? 0} steps, ${
        isCompleted ? "completed" : isLocked ? "locked" : "in progress"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
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
          <h3 className="font-semibold text-foreground truncate">{path.title}</h3>
          <span className={cn(
            "text-xs font-medium",
            isCompleted ? "text-success" : isLocked ? "text-muted-foreground" : "text-primary"
          )}>
            {isCompleted ? "Completed" : isLocked ? "Locked" : progress && progress.completed > 0 ? "In Progress" : "Not Started"}
          </span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{path.description}</p>

      {isLocked ? (
        <p className="text-xs text-muted-foreground">
          Requires: {path.prerequisites.map((slug) => allPaths.find((p) => p.slug === slug)?.title ?? slug).join(", ")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{progress?.completed ?? 0} / {progress?.total ?? 0} steps</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} className="h-2" />
          {!isCompleted && progress?.nextStep && (
            <p className="text-xs text-muted-foreground/70 mt-2 truncate">
              Next: {progress.nextStep.title}
            </p>
          )}
        </>
      )}
    </button>
  );
});

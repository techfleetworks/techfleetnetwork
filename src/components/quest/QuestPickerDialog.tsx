import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Circle, Eye, BookOpen, Rocket, Map as MapIcon, Shield,
  BarChart2, Zap, Briefcase, Heart, ArrowRight, Lock,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useQuestPaths } from "@/hooks/use-quest";
import { cn } from "@/lib/utils";
import type { QuestPath } from "@/services/quest.service";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  rocket: Rocket, map: MapIcon, eye: Eye, "book-open": BookOpen,
  shield: Shield, "bar-chart-2": BarChart2, zap: Zap,
  briefcase: Briefcase, heart: Heart, circle: Circle,
};

/** Only these three slugs are available for users to pick */
const FEATURED_SLUGS = ["client-projects", "learn-skills", "volunteer"] as const;

interface QuestPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPathIds: string[];
  completedPathSlugs: Set<string>;
  /** Called when the user wants to preview/opt-in to a specific quest */
  onPreview: (pathId: string) => void;
}

export function QuestPickerDialog({
  open,
  onOpenChange,
  selectedPathIds,
  completedPathSlugs,
  onPreview,
}: QuestPickerDialogProps) {
  const { data: paths } = useQuestPaths();

  const availableQuests = useMemo(() => {
    if (!paths) return [];
    return paths
      .filter((p) => FEATURED_SLUGS.includes(p.slug as typeof FEATURED_SLUGS[number]))
      .filter((p) => !selectedPathIds.includes(p.id));
  }, [paths, selectedPathIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a Quest</DialogTitle>
          <DialogDescription>
            Pick one quest to focus on. You can add another after you've started this one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {availableQuests.length === 0 && (
            <p className="text-center text-muted-foreground py-6">
              You've already started all available quests!
            </p>
          )}
          {availableQuests.map((quest) => (
            <QuestOption
              key={quest.id}
              quest={quest}
              allPaths={paths ?? []}
              completedPathSlugs={completedPathSlugs}
              onSelect={() => onPreview(quest.id)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestOption({
  quest,
  allPaths,
  completedPathSlugs,
  onSelect,
}: {
  quest: QuestPath;
  allPaths: QuestPath[];
  completedPathSlugs: Set<string>;
  onSelect: () => void;
}) {
  const Icon = ICON_MAP[quest.icon] ?? Circle;
  const prereqsMet = quest.prerequisites.every((slug) => completedPathSlugs.has(slug));
  const missingPrereqs = quest.prerequisites
    .filter((slug) => !completedPathSlugs.has(slug))
    .map((slug) => allPaths.find((p) => p.slug === slug)?.title ?? slug);

  return (
    <button
      onClick={onSelect}
      disabled={!prereqsMet}
      className={cn(
        "w-full card-elevated p-4 text-left rounded-lg transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        prereqsMet
          ? "hover:shadow-md hover:border-primary/30 cursor-pointer"
          : "opacity-60 cursor-not-allowed"
      )}
      aria-label={`Preview quest: ${quest.title}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          {prereqsMet ? (
            <Icon className="h-5 w-5 text-primary" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">{quest.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-1">{quest.description}</p>
          {!prereqsMet && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Requires: {missingPrereqs.join(", ")}
            </p>
          )}
          {prereqsMet && (
            <p className="text-xs text-muted-foreground mt-0.5">{quest.estimated_duration}</p>
          )}
        </div>
        {prereqsMet && (
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>
    </button>
  );
}

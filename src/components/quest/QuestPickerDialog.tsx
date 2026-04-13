import { useMemo } from "react";
import { BookOpen, Users, Heart, ArrowRight, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useQuestPaths } from "@/hooks/use-quest";
import { cn } from "@/lib/utils";
import type { QuestPath } from "@/services/quest.service";

const QUEST_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  "learn-skills": { icon: BookOpen, color: "bg-primary/10 text-primary" },
  "client-projects": { icon: Users, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  "volunteer": { icon: Heart, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
};

const FEATURED_SLUGS = ["learn-skills", "client-projects", "volunteer"] as const;

interface QuestPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPathIds: string[];
  completedPathSlugs: Set<string>;
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Find a Quest</DialogTitle>
          <DialogDescription>
            Choose a quest to learn more about it. Pick one that fits your goals.
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
  const meta = QUEST_META[quest.slug] ?? { icon: BookOpen, color: "bg-muted text-muted-foreground" };
  const Icon = meta.icon;
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
      aria-label={`Learn more about quest: ${quest.title}`}
    >
      <div className="flex items-center gap-3">
        <div className={cn("flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center", prereqsMet ? meta.color : "bg-muted")}>
          {prereqsMet ? (
            <Icon className="h-5 w-5" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">{quest.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{quest.description}</p>
          {!prereqsMet && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Requires: {missingPrereqs.join(", ")}
            </p>
          )}
          {prereqsMet && (
            <p className="text-xs text-muted-foreground mt-1">{quest.estimated_duration}</p>
          )}
        </div>
        {prereqsMet && (
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>
    </button>
  );
}

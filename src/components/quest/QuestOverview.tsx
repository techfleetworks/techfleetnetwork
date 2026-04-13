import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Compass, Rocket } from "lucide-react";
import { useQuestPaths, useUserQuestSelections } from "@/hooks/use-quest";
import { QuestPickerDialog } from "./QuestPickerDialog";
import { QuestPreviewDialog } from "./QuestPreviewDialog";

/**
 * Quest Overview — empty-state with explanation + button to browse quests.
 * If the user already has an active quest, navigates to its detail page.
 */
export function QuestOverview() {
  const navigate = useNavigate();
  const { data: paths, isLoading: pathsLoading } = useQuestPaths();
  const { data: selections, isLoading: selectionsLoading } = useUserQuestSelections();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewPathId, setPreviewPathId] = useState<string | null>(null);

  const selectedPathIds = useMemo(
    () => selections?.map((s) => s.path_id) ?? [],
    [selections],
  );

  const completedPathSlugs = useMemo(() => {
    if (!selections || !paths) return new Set<string>();
    const completedIds = new Set(
      selections.filter((s) => s.completed_at).map((s) => s.path_id),
    );
    return new Set(
      paths.filter((p) => completedIds.has(p.id)).map((p) => p.slug),
    );
  }, [selections, paths]);

  const hasActiveQuest = selectedPathIds.length > 0;

  if (pathsLoading || selectionsLoading) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label="Loading quests">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {hasActiveQuest ? (
        /* User already has quest(s) — show a summary card for each */
        <div className="space-y-4">
          {selections?.map((sel) => {
            const path = paths?.find((p) => p.id === sel.path_id);
            if (!path) return null;
            return (
              <div
                key={sel.id}
                className="card-elevated rounded-lg p-6 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Rocket className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{path.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {path.description}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(`/my-journey/quest/${path.id}`)}
                  size="sm"
                >
                  Continue
                </Button>
              </div>
            );
          })}

          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setPickerOpen(true)}>
              <Compass className="mr-2 h-4 w-4" />
              Browse More Quests
            </Button>
          </div>
        </div>
      ) : (
        /* Empty state — no quests yet */
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Compass className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Start Your Quest
          </h2>
          <p className="text-muted-foreground max-w-md mb-6 leading-relaxed">
            Quests are guided learning paths that help you build real-world skills
            step by step. Choose a quest to review what's involved, then subscribe
            to begin tracking your progress.
          </p>
          <Button size="lg" onClick={() => setPickerOpen(true)}>
            <Compass className="mr-2 h-5 w-5" />
            Choose a Quest
          </Button>
        </div>
      )}

      {/* Quest picker dialog */}
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

      {/* Quest preview/subscribe dialog */}
      {previewPathId && (
        <QuestPreviewDialog
          open={!!previewPathId}
          onOpenChange={(open) => { if (!open) setPreviewPathId(null); }}
          pathId={previewPathId}
          completedPathSlugs={completedPathSlugs}
        />
      )}
    </div>
  );
}

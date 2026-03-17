import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Play,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  TEAMWORK_COURSE_SECTIONS,
  ALL_TEAMWORK_LESSON_IDS,
  ALL_TEAMWORK_LESSONS,
  TOTAL_TEAMWORK_LESSONS,
  type TeamworkLesson,
} from "@/data/teamwork-course";

export default function ThirdStepsPage() {
  const { user } = useAuth();
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [selectedLesson, setSelectedLesson] = useState<TeamworkLesson | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [toggling, setToggling] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  // Load progress
  useEffect(() => {
    if (!user) return;
    supabase
      .from("journey_progress")
      .select("task_id, completed")
      .eq("user_id", user.id)
      .eq("phase", "third_steps")
      .then(({ data }) => {
        if (data) {
          setCompletedSet(
            new Set(data.filter((r) => r.completed).map((r) => r.task_id))
          );
        }
        setProgressLoaded(true);
      });
  }, [user]);

  // Auto-expand the first section with incomplete lessons
  useEffect(() => {
    if (!progressLoaded) return;
    const currentSectionIdx = TEAMWORK_COURSE_SECTIONS.findIndex((section) =>
      section.lessons.some((l) => !completedSet.has(l.id))
    );
    setExpandedSections(
      new Set(currentSectionIdx >= 0 ? [currentSectionIdx] : [])
    );
  }, [progressLoaded]);

  const completedCount = useMemo(
    () => ALL_TEAMWORK_LESSON_IDS.filter((id) => completedSet.has(id)).length,
    [completedSet]
  );
  const progress = (completedCount / TOTAL_TEAMWORK_LESSONS) * 100;

  const toggleLesson = async (lessonId: string) => {
    if (!user || toggling) return;
    setToggling(true);
    const newCompleted = !completedSet.has(lessonId);
    try {
      await supabase.from("journey_progress").upsert(
        {
          user_id: user.id,
          phase: "third_steps" as const,
          task_id: lessonId,
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,phase,task_id" }
      );
      setCompletedSet((prev) => {
        const next = new Set(prev);
        newCompleted ? next.add(lessonId) : next.delete(lessonId);
        return next;
      });
    } finally {
      setToggling(false);
    }
  };

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const sectionProgress = (sectionIdx: number) => {
    const section = TEAMWORK_COURSE_SECTIONS[sectionIdx];
    const done = section.lessons.filter((l) => completedSet.has(l.id)).length;
    return { done, total: section.lessons.length };
  };

  /** Render lesson content with basic markdown-like formatting */
  const renderContent = (content: string) => {
    return content.split("\n\n").map((paragraph, i) => {
      // Bold headings
      if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
        return (
          <h3
            key={i}
            className="text-sm font-bold text-foreground mt-4 first:mt-0"
          >
            {paragraph.slice(2, -2)}
          </h3>
        );
      }
      // Lists
      if (paragraph.includes("\n•") || paragraph.startsWith("•")) {
        const items = paragraph.split("\n").filter((l) => l.startsWith("•"));
        return (
          <ul
            key={i}
            className="list-disc list-inside space-y-1 text-sm text-muted-foreground"
          >
            {items.map((item, j) => (
              <li key={j}>{item.slice(2)}</li>
            ))}
          </ul>
        );
      }
      // Numbered lists
      if (/^\d+\./.test(paragraph.trim())) {
        const items = paragraph.split("\n").filter((l) => /^\d+\./.test(l.trim()));
        return (
          <ol
            key={i}
            className="list-decimal list-inside space-y-1 text-sm text-muted-foreground"
          >
            {items.map((item, j) => (
              <li key={j}>{item.replace(/^\d+\.\s*/, "")}</li>
            ))}
          </ol>
        );
      }
      // Regular paragraph — handle inline bold
      const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="text-foreground font-semibold">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            )
          )}
        </p>
      );
    });
  };

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Learn About Agile Teamwork
        </h1>
        <p className="text-muted-foreground mt-1">
          Work through the {TOTAL_TEAMWORK_LESSONS} lessons of the Teammate
          Handbook. Read each lesson and mark it complete.
        </p>
      </div>

      {/* Overall progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">
            {completedCount} of {TOTAL_TEAMWORK_LESSONS} lessons completed
          </span>
          <span className="font-medium text-foreground">
            {Math.round(progress)}%
          </span>
        </div>
        <div
          className="h-2 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {TEAMWORK_COURSE_SECTIONS.map((section, sIdx) => {
          const expanded = expandedSections.has(sIdx);
          const { done, total } = sectionProgress(sIdx);
          const sectionDone = done === total;

          return (
            <div key={sIdx} className="card-elevated overflow-hidden">
              <button
                onClick={() => toggleSection(sIdx)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h2
                    className={`font-semibold text-sm ${
                      sectionDone ? "text-success" : "text-foreground"
                    }`}
                  >
                    {section.title}
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {done}/{total}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-border">
                  {section.lessons.map((lesson) => {
                    const isDone = completedSet.has(lesson.id);
                    return (
                      <div
                        key={lesson.id}
                        className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-border/50 transition-colors ${
                          isDone ? "bg-success/5" : ""
                        }`}
                      >
                        <button
                          onClick={() => {
                            if (!isDone) {
                              setSelectedLesson(lesson);
                            } else {
                              toggleLesson(lesson.id);
                            }
                          }}
                          disabled={toggling}
                          className="flex-shrink-0"
                          aria-label={
                            isDone
                              ? `Mark "${lesson.title}" as incomplete`
                              : `Open "${lesson.title}"`
                          }
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                          )}
                        </button>

                        <span
                          className={`flex-1 text-sm cursor-pointer hover:text-primary transition-colors ${
                            isDone
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                          onClick={() => setSelectedLesson(lesson)}
                        >
                          {lesson.title}
                        </span>

                        <Button
                          variant={lesson.youtubeId ? "default" : "ghost"}
                          size="sm"
                          className={`flex-shrink-0 h-8 ${
                            lesson.youtubeId ? "px-3 gap-1.5" : "px-2"
                          }`}
                          onClick={() => setSelectedLesson(lesson)}
                        >
                          {lesson.youtubeId ? (
                            <>
                              <Play className="h-3.5 w-3.5" />
                              <span className="text-xs">Watch</span>
                            </>
                          ) : (
                            <>
                              <BookOpen className="h-3.5 w-3.5" />
                              <span className="text-xs">Read</span>
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion banner */}
      {completedCount === TOTAL_TEAMWORK_LESSONS && (
        <div className="mt-8 card-elevated border-success/50 bg-success/5 p-6 text-center animate-fade-in">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h2 className="text-xl font-bold text-foreground mb-2">
            🎉 Teammate Handbook Complete!
          </h2>
          <p className="text-muted-foreground">
            You've completed all lessons. You've earned the Teammate badge!
          </p>
        </div>
      )}

      {/* Lesson detail panel */}
      <Sheet
        open={!!selectedLesson}
        onOpenChange={(open) => !open && setSelectedLesson(null)}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
          <SheetHeader className="pb-4 border-b border-border">
            {selectedLesson && (
              <p className="text-xs text-muted-foreground">
                Lesson{" "}
                {ALL_TEAMWORK_LESSONS.findIndex(
                  (l) => l.id === selectedLesson.id
                ) + 1}{" "}
                of {TOTAL_TEAMWORK_LESSONS}
              </p>
            )}
            <SheetTitle className="text-base leading-snug pr-6">
              {selectedLesson?.title}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Lesson details for {selectedLesson?.title}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 pr-2 -mr-2">
            <div className="space-y-4 py-4">
              {/* Video embed */}
              {selectedLesson?.youtubeId && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Video Version
                  </p>
                  <AspectRatio ratio={16 / 9}>
                    <iframe
                      src={`https://www.youtube.com/embed/${selectedLesson.youtubeId}`}
                      title={selectedLesson.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full rounded-lg border border-border"
                    />
                  </AspectRatio>
                  <a
                    href={`https://www.youtube.com/watch?v=${selectedLesson.youtubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Watch on YouTube
                  </a>
                </div>
              )}

              {/* Inline content */}
              {selectedLesson?.content && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {selectedLesson.youtubeId ? "Text Version" : "Lesson Content"}
                  </p>
                  <div className="space-y-3">
                    {renderContent(selectedLesson.content)}
                  </div>
                </div>
              )}

              {/* Source link */}
              <div className="pt-2">
                <a
                  href={selectedLesson?.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Read on Guide
                  </Button>
                </a>
              </div>
            </div>
          </ScrollArea>

          {/* Sticky footer: Mark complete + Back/Next */}
          {selectedLesson &&
            (() => {
              const currentIndex = ALL_TEAMWORK_LESSONS.findIndex(
                (l) => l.id === selectedLesson.id
              );
              const prevLesson =
                currentIndex > 0
                  ? ALL_TEAMWORK_LESSONS[currentIndex - 1]
                  : null;
              const nextLesson =
                currentIndex < ALL_TEAMWORK_LESSONS.length - 1
                  ? ALL_TEAMWORK_LESSONS[currentIndex + 1]
                  : null;

              return (
                <div className="pt-4 border-t border-border space-y-3 shrink-0">
                  <Button
                    className="w-full"
                    variant={
                      completedSet.has(selectedLesson.id) ? "outline" : "default"
                    }
                    onClick={() => toggleLesson(selectedLesson.id)}
                    disabled={toggling}
                  >
                    {completedSet.has(selectedLesson.id) ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Completed — Mark Incomplete
                      </>
                    ) : (
                      <>
                        <Circle className="h-4 w-4 mr-1.5" />
                        Mark as Complete
                      </>
                    )}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={!prevLesson}
                      onClick={() =>
                        prevLesson && setSelectedLesson(prevLesson)
                      }
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={!nextLesson}
                      onClick={() =>
                        nextLesson && setSelectedLesson(nextLesson)
                      }
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              );
            })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

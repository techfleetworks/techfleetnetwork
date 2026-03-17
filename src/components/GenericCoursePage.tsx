import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Play,
  BookOpen,
  Lock,
  AlertTriangle,
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { CourseLesson, CourseSection } from "@/data/project-training-course";

interface GenericCoursePageProps {
  title: string;
  subtitle: string;
  backTo: string;
  backLabel: string;
  phase: string;
  sections: CourseSection[];
  allLessons: CourseLesson[];
  allLessonIds: string[];
  totalLessons: number;
  completionMessage: string;
  completionSubtext: string;
  /** If set, the course is locked until this prerequisite is met */
  prerequisite?: {
    met: boolean;
    loaded: boolean;
    courseName: string;
    courseHref: string;
  };
}

export default function GenericCoursePage({
  title,
  subtitle,
  backTo,
  backLabel,
  phase,
  sections,
  allLessons,
  allLessonIds,
  totalLessons,
  completionMessage,
  completionSubtext,
  prerequisite,
}: GenericCoursePageProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [selectedLesson, setSelectedLesson] = useState<CourseLesson | null>(null);
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
      .eq("phase", phase as any)
      .then(({ data }) => {
        if (data) {
          setCompletedSet(
            new Set(data.filter((r) => r.completed).map((r) => r.task_id))
          );
        }
        setProgressLoaded(true);
      });
  }, [user, phase]);

  // Auto-expand first incomplete section
  useEffect(() => {
    if (!progressLoaded) return;
    const currentSectionIdx = sections.findIndex((section) =>
      section.lessons.some((l) => !completedSet.has(l.id))
    );
    setExpandedSections(
      new Set(currentSectionIdx >= 0 ? [currentSectionIdx] : [])
    );
  }, [progressLoaded]);

  const completedCount = useMemo(
    () => allLessonIds.filter((id) => completedSet.has(id)).length,
    [completedSet, allLessonIds]
  );
  const progress = (completedCount / totalLessons) * 100;

  const toggleLesson = async (lessonId: string) => {
    if (!user || toggling) return;
    setToggling(true);
    const newCompleted = !completedSet.has(lessonId);
    try {
      await supabase.from("journey_progress").upsert(
        {
          user_id: user.id,
          phase: phase as any,
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
    const section = sections[sectionIdx];
    const done = section.lessons.filter((l) => completedSet.has(l.id)).length;
    return { done, total: section.lessons.length };
  };

  const renderContent = (content: string) => {
    return content.split("\n\n").map((paragraph, i) => {
      if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
        return (
          <h3 key={i} className="text-sm font-bold text-foreground mt-4 first:mt-0">
            {paragraph.slice(2, -2)}
          </h3>
        );
      }
      if (paragraph.includes("\n•") || paragraph.startsWith("•")) {
        const items = paragraph.split("\n").filter((l) => l.startsWith("•"));
        return (
          <ul key={i} className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {items.map((item, j) => (
              <li key={j}>{item.slice(2)}</li>
            ))}
          </ul>
        );
      }
      if (/^\d+\./.test(paragraph.trim())) {
        const items = paragraph.split("\n").filter((l) => /^\d+\./.test(l.trim()));
        return (
          <ol key={i} className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            {items.map((item, j) => (
              <li key={j}>{item.replace(/^\d+\.\s*/, "")}</li>
            ))}
          </ol>
        );
      }
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

  // Prerequisite gate
  if (prerequisite && prerequisite.loaded && !prerequisite.met) {
    return (
      <div className="container-app py-8 sm:py-12 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Courses</h1>
          <Breadcrumb className="mt-2">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/training">Courses</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            {title}
          </h1>
          <div className="card-elevated border-warning/30 bg-warning/5 p-6 max-w-md mx-auto">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="font-semibold text-foreground text-sm mb-1">
                  Prerequisite Required
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  You must complete <strong className="text-foreground">{prerequisite.courseName}</strong> before you can access this course.
                </p>
                <Button
                  size="sm"
                  onClick={() => navigate(prerequisite.courseHref)}
                >
                  Go to {prerequisite.courseName}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* Overall progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">
            {completedCount} of {totalLessons} lessons completed
          </span>
          <span className="font-medium text-foreground">{Math.round(progress)}%</span>
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
        {sections.map((section, sIdx) => {
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
      {completedCount === totalLessons && (
        <div className="mt-8 card-elevated border-success/50 bg-success/5 p-6 text-center animate-fade-in">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h2 className="text-xl font-bold text-foreground mb-2">
            {completionMessage}
          </h2>
          <p className="text-muted-foreground">{completionSubtext}</p>
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
                {allLessons.findIndex((l) => l.id === selectedLesson.id) + 1}{" "}
                of {totalLessons}
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

          {selectedLesson &&
            (() => {
              const currentIndex = allLessons.findIndex(
                (l) => l.id === selectedLesson.id
              );
              const prevLesson =
                currentIndex > 0 ? allLessons[currentIndex - 1] : null;
              const nextLesson =
                currentIndex < allLessons.length - 1
                  ? allLessons[currentIndex + 1]
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

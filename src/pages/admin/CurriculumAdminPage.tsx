import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { ThemedAgGrid } from "@/components/AgGrid";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, SectionTitle } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@/lib/react-query";

/**
 * /admin/curriculum — source-of-truth view for course_catalog + lesson_catalog.
 * Edits go through Supabase directly (RLS: admin-only). All writes propagate
 * to journey_phase_definitions via DB trigger; no app-side recompute needed.
 */
interface CourseRow {
  course_key: string;
  phase: string;
  tier: string;
  display_label: string;
  display_order: number;
  active: boolean;
}
interface LessonRow {
  lesson_id: string;
  course_key: string;
  phase: string;
  display_order: number;
  required: boolean;
  active: boolean;
}

export default function CurriculumAdminPage() {
  const qc = useQueryClient();
  const [recomputing, setRecomputing] = useState(false);

  const courses = useQuery({
    queryKey: ["admin", "course_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_catalog")
        .select("course_key, phase, tier, display_label, display_order, active")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CourseRow[];
    },
  });

  const lessons = useQuery({
    queryKey: ["admin", "lesson_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_catalog")
        .select("lesson_id, course_key, phase, display_order, required, active")
        .order("course_key", { ascending: true })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LessonRow[];
    },
  });

  useEffect(() => {
    document.title = "Curriculum admin — Tech Fleet Network";
  }, []);

  const courseCols = useMemo<ColDef<CourseRow>[]>(
    () => [
      { field: "course_key", headerName: "Course key", pinned: "left", width: 220 },
      { field: "display_label", headerName: "Label", flex: 1, editable: true },
      { field: "phase", headerName: "Phase", width: 160 },
      { field: "tier", headerName: "Tier", width: 130, editable: true },
      { field: "display_order", headerName: "Order", width: 100, editable: true },
      { field: "active", headerName: "Active", width: 100, editable: true },
    ],
    [],
  );

  const lessonCols = useMemo<ColDef<LessonRow>[]>(
    () => [
      { field: "lesson_id", headerName: "Lesson ID", pinned: "left", width: 280 },
      { field: "course_key", headerName: "Course", width: 220 },
      { field: "phase", headerName: "Phase", width: 160 },
      { field: "display_order", headerName: "Order", width: 100, editable: true },
      { field: "required", headerName: "Required", width: 110, editable: true },
      { field: "active", headerName: "Active", width: 100, editable: true },
    ],
    [],
  );

  async function onCourseEdit(e: { data: CourseRow; colDef: ColDef<CourseRow>; newValue: unknown }) {
    const field = e.colDef.field as keyof CourseRow | undefined;
    if (!field) return;
    const { error } = await supabase
      .from("course_catalog")
      .update({ [field]: e.newValue })
      .eq("course_key", e.data.course_key);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["admin", "course_catalog"] });
    } else {
      toast({ title: "Course updated", description: `${e.data.course_key}: ${field}`, variant: "default" });
    }
  }

  async function onLessonEdit(e: { data: LessonRow; colDef: ColDef<LessonRow>; newValue: unknown }) {
    const field = e.colDef.field as keyof LessonRow | undefined;
    if (!field) return;
    const { error } = await supabase
      .from("lesson_catalog")
      .update({ [field]: e.newValue })
      .eq("lesson_id", e.data.lesson_id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["admin", "lesson_catalog"] });
    } else {
      toast({ title: "Lesson updated", description: `${e.data.lesson_id}: ${field}`, variant: "default" });
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const { error } = await supabase.rpc("admin_recompute_stats");
      if (error) throw error;
      toast({ title: "Stats recomputed", description: "Network stats rebuilt from catalog.", variant: "default" });
      qc.invalidateQueries({ queryKey: ["network-stats"] });
    } catch (err) {
      toast({ title: "Recompute failed", description: (err as Error)?.message ?? "Unknown", variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <main className="container-app py-8 space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageTitle>Curriculum admin</PageTitle>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Source of truth for courses and lessons. Edits propagate to journey phase definitions and per-course stats automatically.
          </p>
        </div>
        <Button onClick={handleRecompute} disabled={recomputing} variant="outline">
          {recomputing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Recompute stats
        </Button>
      </header>

      <section aria-labelledby="courses-heading" className="space-y-3">
        <SectionTitle id="courses-heading">Courses</SectionTitle>
        {courses.isLoading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <ThemedAgGrid<CourseRow>
            columnDefs={courseCols}
            rowData={courses.data ?? []}
            onCellValueChanged={onCourseEdit}
            domLayout="autoHeight"
            getRowId={(p) => p.data.course_key}
          />
        )}
      </section>

      <section aria-labelledby="lessons-heading" className="space-y-3">
        <SectionTitle id="lessons-heading">Lessons</SectionTitle>
        {lessons.isLoading ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : (
          <ThemedAgGrid<LessonRow>
            columnDefs={lessonCols}
            rowData={lessons.data ?? []}
            onCellValueChanged={onLessonEdit}
            domLayout="autoHeight"
            getRowId={(p) => p.data.lesson_id}
          />
        )}
      </section>
    </main>
  );
}

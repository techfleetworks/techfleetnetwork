import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, CalendarRange } from "lucide-react";
import { format } from "date-fns";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Badge, Button } from "@/design-system";
import { Input } from "@/components/ui/input";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ClassRow } from "@/services/class.service";
import type { CohortWithClass } from "@/services/cohort.service";
import {
  COHORT_REGISTRATION_STATUSES,
  cohortRegistrationStatusLabel,
  type CohortRegistrationStatus,
} from "@/lib/validators/cohort";
import { PublishStatusBadge } from "@/components/classes/ClassList";
import { DeleteCohortDialog } from "@/components/classes/DeleteCohortDialog";
import { AddCohortDialog } from "@/components/classes/AddCohortDialog";

/**
 * The Cohorts tab of Class Admin — a standalone, cross-class cohort management table (ADR-0063). Rows
 * are scoped by RLS (a teacher's own, or every cohort for an admin). Registration status is the
 * cohort-level lifecycle (Coming Soon / Register Now / Live / Finished, from #387) shown read-only
 * here; it's changed via the owner/admin control on the class detail page (the single writer). The
 * parent class's Publish status is shown as context. Actions match the Classes table: Edit + Delete.
 */
const REG_STATUS_PILL: Record<CohortRegistrationStatus, string> = {
  coming_soon: "bg-muted/60 text-muted-foreground border-border",
  register_now: "bg-success/10 text-success border-success/30",
  live: "bg-primary/10 text-primary border-primary/30",
  finished: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const REG_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  ...COHORT_REGISTRATION_STATUSES.map((s) => ({ value: s.value as string, label: s.label })),
];

function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Dates TBD";
  const fmt = (d: string) => format(new Date(d), "MMM d, yyyy");
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt((start ?? end) as string);
}

export function CohortList({
  cohorts,
  isLoading,
  classes,
}: {
  cohorts: CohortWithClass[];
  isLoading: boolean;
  classes: ClassRow[];
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [regFilter, setRegFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<CohortWithClass | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: cohorts.length };
    for (const co of cohorts) c[co.registration_status] = (c[co.registration_status] ?? 0) + 1;
    return c;
  }, [cohorts]);

  const filtered = useMemo(() => {
    return cohorts.filter((co) => {
      if (regFilter !== "all" && co.registration_status !== regFilter) return false;
      if (!q.trim()) return true;
      const t = q.toLowerCase();
      return co.label.toLowerCase().includes(t) || co.class.title.toLowerCase().includes(t);
    });
  }, [cohorts, q, regFilter]);

  const columnDefs = useMemo<ColDef<CohortWithClass>[]>(
    () => [
      {
        headerName: "Cohort",
        field: "label",
        minWidth: 170,
        cellRenderer: (p: ICellRendererParams<CohortWithClass>) => {
          if (!p.data) return null;
          const terminal =
            p.data.status === "cancelled"
              ? "Cancelled"
              : p.data.status === "archived"
                ? "Archived"
                : null;
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{p.data.label}</span>
              {terminal && (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground border-muted-foreground/20"
                >
                  {terminal}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        headerName: "Class",
        colId: "class",
        flex: 2,
        minWidth: 220,
        valueGetter: (p) => p.data?.class.title ?? "",
        cellRenderer: (p: ICellRendererParams<CohortWithClass>) => {
          if (!p.data) return null;
          const cls = p.data.class;
          return (
            <div className="flex flex-col gap-0.5 py-1">
              <a
                href={`/class-admin/classes/${cls.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/class-admin/classes/${cls.id}`);
                }}
                className="text-primary hover:underline font-medium truncate"
              >
                {cls.title}
              </a>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {cls.track === "basic_training" ? "Basic Training" : "Advanced Training"}
                <PublishStatusBadge status={cls.status} />
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Dates",
        colId: "dates",
        minWidth: 190,
        valueGetter: (p) => p.data?.start_date ?? "",
        cellRenderer: (p: ICellRendererParams<CohortWithClass>) =>
          p.data ? dateRange(p.data.start_date, p.data.end_date) : null,
      },
      {
        headerName: "Registration status",
        field: "registration_status",
        minWidth: 170,
        cellRenderer: (p: ICellRendererParams<CohortWithClass>) => {
          const s = p.value as CohortRegistrationStatus;
          return (
            <Badge variant="outline" className={REG_STATUS_PILL[s] ?? ""}>
              {cohortRegistrationStatusLabel(s)}
            </Badge>
          );
        },
      },
      {
        headerName: "Actions",
        colId: "actions",
        sortable: false,
        filter: false,
        resizable: false,
        minWidth: 170,
        cellRenderer: (p: ICellRendererParams<CohortWithClass>) => {
          if (!p.data) return null;
          const co = p.data;
          return (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/class-admin/classes/${co.class_id}/cohorts/${co.id}/edit`);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(co);
                }}
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [navigate]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filter cohorts by registration status"
        >
          {REG_FILTERS.map((f) => {
            const active = regFilter === f.value;
            const n = counts[f.value] ?? 0;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => setRegFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                }`}
              >
                {f.label}
                <span
                  className={`ml-1.5 text-xs ${active ? "opacity-90" : "text-muted-foreground"}`}
                >
                  ({n})
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="Search cohorts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
            aria-label="Search cohorts"
          />
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Add cohort
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : cohorts.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <CalendarRange
            className="h-10 w-10 mx-auto text-muted-foreground mb-3"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">No cohorts yet.</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            Add your first cohort
          </Button>
        </div>
      ) : (
        <ThemedAgGrid<CohortWithClass>
          gridId="class-admin-cohorts"
          height="600px"
          rowData={filtered}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          pagination
          paginationPageSize={25}
          showExportCsv
          exportFileName="cohorts"
          disableCellCopy
        />
      )}

      <AddCohortDialog classes={classes} open={addOpen} onOpenChange={setAddOpen} />
      <DeleteCohortDialog
        cohort={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      />
    </div>
  );
}

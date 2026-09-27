import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Loader2, AlertTriangle, GraduationCap } from "lucide-react";
import { format } from "date-fns";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Badge, Button } from "@/design-system";
import { Input } from "@/components/ui/input";
import { ThemedAgGrid } from "@/components/AgGrid";
import { stripHtml } from "@/lib/strip-html";
import { ClassService, type ClassRow } from "@/services/class.service";
import { RequestChangesDialog } from "@/components/classes/RequestChangesDialog";
import { ArchiveDialog } from "@/components/classes/ArchiveDialog";
import { PreSubmitChecklist } from "@/components/classes/PreSubmitChecklist";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@/lib/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The Classes tab of Class Admin — one role-aware list that replaces the old duplicated
 * AdminClassesPage + MyClassesPage (ADR-0063). `mode="admin"` shows every class with the review
 * workflow (approve / request changes / archive); `mode="mine"` shows the current teacher's own
 * classes with author actions (edit / submit). The caller (ClassAdminPage) picks the mode from role
 * and passes the already-fetched rows, so only one query runs.
 */
const STATUS_PILL: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-muted-foreground/20",
  pending_review: "bg-warning/10 text-warning border-warning/30",
  published: "bg-success/10 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const ADMIN_FILTERS = [
  { value: "pending_review", label: "Pending review" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

const MINE_FILTERS = [
  { value: "attention", label: "Needs your attention" },
  { value: "pending_review", label: "Pending review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

export function PublishStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_PILL[status] ?? ""}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function ChangesRequestedChip({ classId }: { classId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["classes", "audit", classId] as const,
    queryFn: () => ClassService.listAuditHistory(classId),
  });
  const reason = data.find((d) => d.action === "request_changes")?.reason;
  if (!reason) return null;
  return (
    <Badge
      variant="outline"
      className="bg-warning/10 text-warning border-warning/30 cursor-help"
      title={reason}
    >
      <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
      Changes requested
    </Badge>
  );
}

export function ClassList({
  mode,
  classes,
  isLoading,
}: {
  mode: "admin" | "mine";
  classes: ClassRow[];
  isLoading: boolean;
}) {
  const isAdmin = mode === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filters = isAdmin ? ADMIN_FILTERS : MINE_FILTERS;

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(isAdmin ? "pending_review" : "attention");

  // admin review targets
  const [denyTarget, setDenyTarget] = useState<ClassRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClassRow | null>(null);
  const [approveTarget, setApproveTarget] = useState<ClassRow | null>(null);
  const [busy, setBusy] = useState(false);
  // teacher submit target
  const [submitTarget, setSubmitTarget] = useState<ClassRow | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: classes.length,
      pending_review: 0,
      draft: 0,
      published: 0,
      archived: 0,
      attention: 0,
    };
    for (const cls of classes) {
      c[cls.status] = (c[cls.status] ?? 0) + 1;
      if (cls.status === "draft") c.attention += 1;
    }
    return c;
  }, [classes]);

  const filtered = useMemo(() => {
    return classes.filter((c) => {
      if (status === "attention") {
        if (c.status !== "draft") return false;
      } else if (status !== "all" && c.status !== status) {
        return false;
      }
      if (!q.trim()) return true;
      const t = q.toLowerCase();
      return c.title.toLowerCase().includes(t) || stripHtml(c.summary).toLowerCase().includes(t);
    });
  }, [classes, q, status]);

  const approve = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await ClassService.approveAndPublish(approveTarget.id);
      toast.success("Class published");
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
      setApproveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  };

  const columnDefs = useMemo<ColDef<ClassRow>[]>(() => {
    const cols: ColDef<ClassRow>[] = [
      {
        headerName: "Title",
        field: "title",
        flex: 2,
        minWidth: 200,
        cellRenderer: (p: ICellRendererParams<ClassRow>) => {
          if (!p.data) return null;
          return (
            <div className="flex items-center gap-2">
              <a
                href={`/class-admin/classes/${p.data.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/class-admin/classes/${p.data!.id}`);
                }}
                className="text-primary hover:underline font-medium truncate"
              >
                {p.data.title}
              </a>
              {!isAdmin && p.data.status === "draft" && (
                <ChangesRequestedChip classId={p.data.id} />
              )}
            </div>
          );
        },
      },
      {
        headerName: "Track",
        field: "track",
        minWidth: 130,
        valueFormatter: (p) => (p.value === "basic_training" ? "Basic" : "Advanced"),
      },
      {
        headerName: "Publish status",
        field: "status",
        minWidth: 150,
        cellRenderer: (p: ICellRendererParams<ClassRow>) => (
          <PublishStatusBadge status={p.value as string} />
        ),
      },
      {
        headerName: "Submitted",
        field: "submitted_at",
        minWidth: 140,
        sort: isAdmin ? "desc" : undefined,
        valueFormatter: (p) => (p.value ? format(new Date(p.value), "MMM d, yyyy") : "—"),
      },
    ];

    if (!isAdmin) {
      cols.push({
        headerName: "Published",
        field: "published_at",
        minWidth: 140,
        valueFormatter: (p) => (p.value ? format(new Date(p.value), "MMM d, yyyy") : "—"),
      });
    }

    cols.push({
      headerName: "Updated",
      field: "updated_at",
      minWidth: 130,
      sort: isAdmin ? undefined : "desc",
      valueFormatter: (p) => format(new Date(p.value), "MMM d, yyyy"),
    });

    cols.push({
      headerName: "Actions",
      colId: "actions",
      sortable: false,
      filter: false,
      resizable: false,
      minWidth: isAdmin ? 280 : 220,
      cellRenderer: (p: ICellRendererParams<ClassRow>) => {
        if (!p.data) return null;
        const c = p.data;
        if (isAdmin) {
          return (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/class-admin/classes/${c.id}`);
                }}
              >
                Review
              </Button>
              {c.status === "pending_review" && (
                <>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApproveTarget(c);
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDenyTarget(c);
                    }}
                  >
                    Changes
                  </Button>
                </>
              )}
              {c.status !== "archived" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchiveTarget(c);
                  }}
                >
                  Archive
                </Button>
              )}
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/class-admin/classes/${c.id}/edit`);
              }}
            >
              Edit
            </Button>
            {c.status === "draft" && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSubmitTarget(c);
                }}
              >
                Submit
              </Button>
            )}
          </div>
        );
      },
    });

    return cols;
  }, [navigate, isAdmin]);

  const showEmptyState = !isAdmin && !isLoading && classes.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filter classes by publish status"
        >
          {filters.map((f) => {
            const active = status === f.value;
            const n = counts[f.value] ?? 0;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(f.value)}
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
            placeholder="Search classes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
            aria-label="Search classes"
          />
          <Button asChild>
            <Link to="/class-admin/classes/new" aria-label="Create a new class">
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              New class
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : showEmptyState ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <GraduationCap
            className="h-10 w-10 mx-auto text-muted-foreground mb-3"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">You have not created any classes yet.</p>
          <Button asChild className="mt-4">
            <Link to="/class-admin/classes/new">Create your first class</Link>
          </Button>
        </div>
      ) : (
        <ThemedAgGrid<ClassRow>
          gridId={isAdmin ? "admin-classes" : "my-classes"}
          height="600px"
          rowData={filtered}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          pagination
          paginationPageSize={25}
          showExportCsv
          exportFileName={isAdmin ? "classes-admin" : "my-classes"}
          disableCellCopy
        />
      )}

      <RequestChangesDialog
        classId={denyTarget?.id ?? ""}
        open={!!denyTarget}
        onOpenChange={(o) => !o && setDenyTarget(null)}
      />
      <ArchiveDialog
        classId={archiveTarget?.id ?? ""}
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
      />
      <AlertDialog
        open={!!approveTarget}
        onOpenChange={(o) => !busy && !o && setApproveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve &amp; publish "{approveTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The class becomes visible in{" "}
              {approveTarget?.track === "basic_training" ? "Basic" : "Advanced"} Training, and any
              cohorts pending review will go live too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void approve();
              }}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Approve &amp; publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {submitTarget && (
        <PreSubmitChecklist
          cls={submitTarget}
          open={!!submitTarget}
          onOpenChange={(o) => !o && setSubmitTarget(null)}
        />
      )}
    </div>
  );
}

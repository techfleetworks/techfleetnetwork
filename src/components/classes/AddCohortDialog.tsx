import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClassRow } from "@/services/class.service";

/**
 * A cohort always belongs to a class, so adding one from the standalone Cohorts tab first asks which
 * class. Picking a class opens the existing cohort create form (CohortFormPage) — no second create
 * path. The class list is whatever the caller already loaded (the teacher's own, or every class for an
 * admin), so this dialog stays presentational.
 */
export function AddCohortDialog({
  classes,
  open,
  onOpenChange,
}: {
  classes: ClassRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a cohort</DialogTitle>
          <DialogDescription>
            A cohort belongs to a class. Choose the class to add it to.
          </DialogDescription>
        </DialogHeader>

        {classes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            You don't have a class yet. Create a class first, then add a cohort to it.
          </p>
        ) : (
          <ul className="max-h-[320px] space-y-1.5 overflow-y-auto py-1">
            {classes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/class-admin/classes/${c.id}/cohorts/new`);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.track === "basic_training" ? "Basic Training" : "Advanced Training"}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

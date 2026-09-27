import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { useDeleteCohort } from "@/hooks/use-cohorts";
import { extractErrorMessage } from "@/lib/errors/extract";
import type { CohortWithClass } from "@/services/cohort.service";

/**
 * Confirm deleting a cohort. The owner-or-admin RPC (delete_cohort, ADR-0063) decides the outcome:
 * an empty, unpublished cohort is permanently deleted; one that is published or has registrations is
 * soft-cancelled so registration history is never silently dropped. We surface that up front and
 * report which happened. Data access goes through the hook → service → RPC (no Supabase here).
 */
export function DeleteCohortDialog({
  cohort,
  open,
  onOpenChange,
}: {
  cohort: CohortWithClass | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const del = useDeleteCohort();
  const busy = del.isPending;
  const published = cohort?.status === "published";

  const onConfirm = async () => {
    if (!cohort) return;
    try {
      const result = await del.mutateAsync({ cohortId: cohort.id, classId: cohort.class_id });
      toast.success(
        result === "cancelled"
          ? `"${cohort.label}" was cancelled — registrations are preserved`
          : `"${cohort.label}" was deleted`
      );
      onOpenChange(false);
    } catch (err) {
      const { message, description } = extractErrorMessage(err, "We couldn't delete this cohort.");
      toast.error(message, description ? { description } : undefined);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{cohort?.label}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {published
              ? "This cohort is published. To avoid dropping anyone who registered, it will be cancelled (kept and marked Cancelled) rather than permanently deleted."
              : "If anyone has registered, the cohort is cancelled (kept) so their registration isn't lost. An empty cohort with no registrations is permanently deleted — this can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />}
            Delete cohort
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

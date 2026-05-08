import { useState } from "react";
import { Send, ArchiveX, CheckCircle2, MessageSquareWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClassService, type ClassRow } from "@/services/class.service";
import { useQueryClient } from "@/lib/react-query";
import { PreSubmitChecklist } from "./PreSubmitChecklist";
import { RequestChangesDialog } from "./RequestChangesDialog";
import { ArchiveDialog } from "./ArchiveDialog";

interface Props {
  cls: ClassRow;
  isOwner: boolean;
  isAdmin: boolean;
}

export function ApprovalActions({ cls, isOwner, isAdmin }: Props) {
  const qc = useQueryClient();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      await ClassService.approveAndPublish(cls.id);
      toast.success("Class published");
      qc.invalidateQueries({ queryKey: ["classes"] });
      setApproveOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {cls.status === "draft" && isOwner && (
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Send className="h-4 w-4 mr-1.5" aria-hidden="true" />Submit for review
          </Button>
        )}
        {cls.status === "pending_review" && isAdmin && (
          <>
            <Button size="sm" onClick={() => setApproveOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />Approve & publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDenyOpen(true)}>
              <MessageSquareWarning className="h-4 w-4 mr-1.5" aria-hidden="true" />Request changes
            </Button>
          </>
        )}
        {cls.status !== "archived" && isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
            <ArchiveX className="h-4 w-4 mr-1.5" aria-hidden="true" />Archive
          </Button>
        )}
      </div>

      <PreSubmitChecklist cls={cls} open={submitOpen} onOpenChange={setSubmitOpen} />
      <RequestChangesDialog classId={cls.id} open={denyOpen} onOpenChange={setDenyOpen} />
      <ArchiveDialog classId={cls.id} open={archiveOpen} onOpenChange={setArchiveOpen} />

      <AlertDialog open={approveOpen} onOpenChange={(o) => !busy && setApproveOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve & publish this class?</AlertDialogTitle>
            <AlertDialogDescription>
              The class will become visible in {cls.track === "basic_training" ? "Basic" : "Advanced"} Training, and any cohorts pending review will go live too. The teacher will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); approve(); }} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Approve & publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

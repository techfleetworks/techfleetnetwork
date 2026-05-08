import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ClassService } from "@/services/class.service";
import { useQueryClient } from "@/lib/react-query";

interface Props {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArchiveDialog({ classId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await ClassService.archive(classId, reason.trim() || undefined);
      toast.success("Class archived");
      qc.invalidateQueries({ queryKey: ["classes"] });
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive class</DialogTitle>
          <DialogDescription>
            Archived classes are hidden from public Training pages. Cohorts that are not cancelled will also be archived.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="archive-reason">Reason (optional)</Label>
          <Textarea
            id="archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this class being archived?"
            rows={4}
            maxLength={2000}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

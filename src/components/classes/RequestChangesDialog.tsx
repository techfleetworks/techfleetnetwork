import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClassService } from "@/services/class.service";
import { useQueryClient } from "@/lib/react-query";

const CANNED = [
  "Outcomes need clarifying.",
  "Summary is too short — please expand.",
  "Missing prerequisites.",
  "Hero image is missing or low quality.",
];

interface Props {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestChangesDialog({ classId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const len = reason.trim().length;
  const valid = len >= 20 && len <= 2000;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await ClassService.requestChanges(classId, reason.trim());
      toast.success("Changes requested. The teacher has been notified.");
      qc.invalidateQueries({ queryKey: ["classes"] });
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request changes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            The class will be sent back to the teacher as a draft. They will see your reason and can resubmit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {CANNED.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setReason((prev) => (prev ? `${prev}\n${c}` : c))}
                className="text-xs"
              >
                <Badge variant="secondary" className="cursor-pointer hover:bg-muted">{c}</Badge>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what needs to change so the teacher can address it…"
              rows={5}
              maxLength={2000}
              aria-describedby="reason-help"
            />
            <p id="reason-help" className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
              {len} / 2000 characters (minimum 20)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Send back to draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

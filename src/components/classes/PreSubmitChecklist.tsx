import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClassService, type ClassRow } from "@/services/class.service";
import { stripHtml } from "@/lib/strip-html";
import { useQueryClient } from "@/lib/react-query";

interface Props {
  cls: ClassRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Check { label: string; ok: boolean }

function buildChecks(cls: ClassRow): Check[] {
  return [
    { label: "Title is set", ok: !!cls.title?.trim() },
    { label: "Summary is at least 20 characters", ok: stripHtml(cls.summary || "").trim().length >= 20 },
    { label: "Track selected", ok: !!cls.track },
    { label: "Outcomes filled in", ok: stripHtml(cls.outcomes || "").trim().length > 0 },
  ];
}

export function PreSubmitChecklist({ cls, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const checks = buildChecks(cls);
  const allOk = checks.every((c) => c.ok);

  const submit = async () => {
    if (!allOk) return;
    setBusy(true);
    try {
      await ClassService.submitForReview(cls.id);
      toast.success("Submitted for review. An admin will be notified.");
      qc.invalidateQueries({ queryKey: ["classes"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit for review</DialogTitle>
          <DialogDescription>
            Once submitted, an admin will review your class. You can keep editing while it's pending.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 py-2" aria-label="Pre-submit checklist">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-success shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" aria-hidden="true" />
              )}
              <span className={c.ok ? "text-foreground" : "text-destructive"}>{c.label}</span>
            </li>
          ))}
        </ul>
        {!allOk && (
          <p className="text-xs text-muted-foreground">
            Fill in the missing fields from the Edit page, then submit.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!allOk || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Submit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

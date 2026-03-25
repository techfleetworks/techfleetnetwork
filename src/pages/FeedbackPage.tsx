import { useState, useEffect, useMemo, useCallback } from "react";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { useQuery, useQueryClient } from "@/lib/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FEEDBACK_AREAS, FeedbackService, type Feedback } from "@/services/feedback.service";
import { toast } from "sonner";
import { Send, MessageSquarePlus, Loader2, CheckCircle2 } from "lucide-react";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef, RowClickedEvent } from "ag-grid-community";
import { format } from "date-fns";
import FeedbackDetailPanel from "@/components/feedback/FeedbackDetailPanel";
import { SectionEmptyState } from "@/components/SectionEmptyState";

/* ── Member feedback form ──────────────────────────────── */
function FeedbackForm() {
  const { user } = useAuth();
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const canSubmit = area !== "" && message.trim().length >= 10;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    const ok = await FeedbackService.submit(user.id, user.email ?? "", area, message.trim());
    setSubmitting(false);
    if (ok) {
      setArea("");
      setMessage("");
      setShowSuccess(true);
      // Fire-and-forget Discord notification
      const displayName = user.email?.split("@")[0] || "A member";
      DiscordNotifyService.feedbackSubmitted(displayName, area);
    } else {
      toast.error("Failed to submit feedback. Please try again.");
    }
  };

  return (
    <>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              <CardTitle>Share Your Feedback</CardTitle>
            </div>
            <CardDescription>
              Help us improve Tech Fleet Network. Select the area your feedback is about and share your thoughts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="feedback-area" className="text-base font-semibold">
                System Area <span className="text-destructive">*</span>
              </Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger id="feedback-area">
                  <SelectValue placeholder="Select the area of the platform" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_AREAS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-message" className="text-base font-semibold">
                Your Feedback <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your thoughts, suggestions, or report an issue…"
                className="min-h-[160px] resize-y"
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length} / 5,000
              </p>
              {message.length > 0 && message.trim().length < 10 && (
                <p className="text-sm text-destructive">Please write at least 10 characters.</p>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {submitting ? "Submitting…" : "Submit Feedback"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl">Feedback Submitted</DialogTitle>
            <DialogDescription className="text-base leading-relaxed pt-2">
              Thanks for your feedback. Your voice helps us improve the experience for Tech Fleet members. An admin will email you shortly. Please allow up to 5 business days to receive a response.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pt-2">
            <Button onClick={() => setShowSuccess(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Admin feedback table ──────────────────────────────── */
function AdminFeedbackView() {
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: feedback = [], isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: () => FeedbackService.listAll(),
  });

  /* ── inline feedback form state ── */
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = area !== "" && message.trim().length >= 10;

  const handleAdminSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    const ok = await FeedbackService.submit(user.id, user.email ?? "", area, message.trim());
    setSubmitting(false);
    if (ok) {
      setArea("");
      setMessage("");
      setFormOpen(false);
      toast.success("Feedback submitted successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    } else {
      toast.error("Failed to submit feedback. Please try again.");
    }
  };

  const columnDefs = useMemo<ColDef<Feedback>[]>(() => [
    {
      headerName: "Date",
      field: "created_at",
      width: 170,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy h:mm a") : "",
      sort: "desc",
    },
    { headerName: "Email", field: "user_email", flex: 1, minWidth: 180 },
    { headerName: "Area", field: "system_area", width: 180 },
    {
      headerName: "Message",
      field: "message",
      flex: 2,
      minWidth: 250,
      valueFormatter: (p) => {
        const msg = p.value || "";
        return msg.length > 80 ? msg.slice(0, 80) + "…" : msg;
      },
    },
  ], []);

  const onRowClicked = useCallback((e: RowClickedEvent<Feedback>) => {
    if (e.data) {
      setSelected(e.data);
      setPanelOpen(true);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (feedback.length === 0) {
  return (
    <div className="container-app py-8 sm:py-12 space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen(true)}>
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Add Feedback
        </Button>
      </div>
      <SectionEmptyState
          icon={MessageSquarePlus}
          title="No Feedback Yet"
          description="When members submit feedback, it will appear here."
        />
        <AdminFeedbackDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          area={area}
          setArea={setArea}
          message={message}
          setMessage={setMessage}
          submitting={submitting}
          canSubmit={canSubmit}
          onSubmit={handleAdminSubmit}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen(true)}>
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Add Feedback
        </Button>
      </div>

      <ThemedAgGrid<Feedback>
        gridId="admin-feedback"
        height="calc(100vh - 240px)"
        rowData={feedback}
        columnDefs={columnDefs}
        onRowClicked={onRowClicked}
        getRowId={(params) => params.data.id}
        exportFileName="feedback"
        showExportCsv
      />

      <FeedbackDetailPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        feedback={selected}
      />

      <AdminFeedbackDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        area={area}
        setArea={setArea}
        message={message}
        setMessage={setMessage}
        submitting={submitting}
        canSubmit={canSubmit}
        onSubmit={handleAdminSubmit}
      />
    </div>
  );
}

/* ── Admin feedback dialog ─────────────────────────────── */
function AdminFeedbackDialog({
  open, onOpenChange, area, setArea, message, setMessage, submitting, canSubmit, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  area: string;
  setArea: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Add Feedback
          </DialogTitle>
          <DialogDescription>
            Share your feedback about the platform as an admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="admin-feedback-area" className="text-sm font-semibold">
              System Area <span className="text-destructive">*</span>
            </Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger id="admin-feedback-area">
                <SelectValue placeholder="Select the area of the platform" />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-feedback-message" className="text-sm font-semibold">
              Your Feedback <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="admin-feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share your thoughts, suggestions, or report an issue…"
              className="min-h-[140px] resize-y"
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length} / 5,000
            </p>
            {message.length > 0 && message.trim().length < 10 && (
              <p className="text-sm text-destructive">Please write at least 10 characters.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Submitting…" : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main page — admin sees table, members see form ──── */
export default function FeedbackPage() {
  const { setHeader } = usePageHeader();
  const { isAdmin, loading: adminLoading } = useAdmin();

  useEffect(() => {
    setHeader({ title: isAdmin ? "Feedback" : "Submit Feedback" });
    return () => setHeader(null);
  }, [setHeader, isAdmin]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return isAdmin ? <AdminFeedbackView /> : <FeedbackForm />;
}

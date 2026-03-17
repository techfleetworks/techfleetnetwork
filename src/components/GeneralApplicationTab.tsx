import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FileText,
  Trash2,
  Save,
  CheckCircle2,
  Copy,
  Loader2,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  GeneralApplicationService,
  type GeneralApplication,
} from "@/services/general-application.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type View = "list" | "edit";

export function GeneralApplicationTab() {
  const { user } = useAuth();
  const [apps, setApps] = useState<GeneralApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [activeApp, setActiveApp] = useState<GeneralApplication | null>(null);
  const [aboutYourself, setAboutYourself] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isNewApp, setIsNewApp] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [prefillDialogOpen, setPrefillDialogOpen] = useState(false);
  const [latestCompleted, setLatestCompleted] =
    useState<GeneralApplication | null>(null);
  const [creatingWithPrefill, setCreatingWithPrefill] = useState(false);

  const loadApps = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await GeneralApplicationService.list(user.id);
      setApps(data);
    } catch {
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleNewApp = async () => {
    if (!user) return;
    // Check if there's a completed app to prefill from
    const completed =
      await GeneralApplicationService.getLatestCompleted(user.id);
    if (completed) {
      setLatestCompleted(completed);
      setPrefillDialogOpen(true);
    } else {
      await createApp();
    }
  };

  const createApp = async (prefill?: GeneralApplication) => {
    if (!user) return;
    setCreatingWithPrefill(true);
    try {
      const app = await GeneralApplicationService.create(
        user.id,
        prefill ? { about_yourself: prefill.about_yourself } : undefined
      );
      setActiveApp(app);
      setAboutYourself(app.about_yourself);
      setIsNewApp(true);
      setView("edit");
      await loadApps();
    } catch {
      toast.error("Failed to create application");
    } finally {
      setCreatingWithPrefill(false);
      setPrefillDialogOpen(false);
    }
  };

  const openApp = (app: GeneralApplication) => {
    setActiveApp(app);
    setAboutYourself(app.about_yourself);
    setIsNewApp(false);
    setView("edit");
  };

  const handleSave = async (markComplete = false) => {
    if (!activeApp) return;
    setSaving(true);
    try {
      await GeneralApplicationService.save(activeApp.id, {
        about_yourself: aboutYourself,
        status: markComplete ? "completed" : "draft",
      });
      toast.success(
        markComplete ? "Application submitted!" : "Progress saved"
      );
      const updated = await GeneralApplicationService.fetch(activeApp.id);
      if (updated) setActiveApp(updated);
      await loadApps();
      if (markComplete) {
        setView("list");
      }
    } catch {
      toast.error("Failed to save application");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await GeneralApplicationService.remove(id);
      toast.success("Application deleted");
      if (activeApp?.id === id) {
        setView("list");
        setActiveApp(null);
      }
      await loadApps();
    } catch {
      toast.error("Failed to delete application");
    } finally {
      setDeleting(null);
      setDeleteDialogId(null);
    }
  };

  // List view
  if (view === "list") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Your General Applications
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Write once, reuse for multiple project and volunteer applications.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No applications yet
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              Create your first general application. You can save your progress
              and come back anytime.
            </p>
            <Button onClick={handleNewApp} disabled={creatingWithPrefill}>
              <Plus className="h-4 w-4 mr-2" />
              Start Your First Application
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <div
                key={app.id}
                className="card-elevated p-4 flex items-center justify-between gap-4"
              >
                <button
                  type="button"
                  className="flex-1 text-left flex items-center gap-3 min-w-0"
                  onClick={() => openApp(app)}
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {app.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated{" "}
                      {new Date(app.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={
                      app.status === "completed" ? "default" : "secondary"
                    }
                    className={cn(
                      app.status === "completed" &&
                        "bg-success/10 text-success border-success/30"
                    )}
                  >
                    {app.status === "completed" ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                      </>
                    ) : (
                      "Draft"
                    )}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialogId(app.id);
                    }}
                    disabled={deleting === app.id}
                    aria-label={`Delete ${app.title}`}
                  >
                    {deleting === app.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirmation dialog */}
        <Dialog
          open={!!deleteDialogId}
          onOpenChange={() => setDeleteDialogId(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">
                Delete Application
              </DialogTitle>
              <DialogDescription>
                This will permanently delete this application. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteDialogId && handleDelete(deleteDialogId)}
                disabled={!!deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Prefill from previous dialog */}
        <Dialog
          open={prefillDialogOpen}
          onOpenChange={setPrefillDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start from Previous Application?</DialogTitle>
              <DialogDescription>
                You have a previously completed application. Would you like to
                copy its answers into your new application as a starting point?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => createApp()}
                disabled={creatingWithPrefill}
              >
                Start Fresh
              </Button>
              <Button
                onClick={() =>
                  latestCompleted && createApp(latestCompleted)
                }
                disabled={creatingWithPrefill}
              >
                <Copy className="h-4 w-4 mr-2" />
                {creatingWithPrefill
                  ? "Creating…"
                  : "Copy from Previous"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Edit view
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setView("list")}
        >
          Applications
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-foreground truncate">
          {isNewApp ? "Create General Application" : "Edit Existing General Application"}
        </span>
        {activeApp && (
          <Badge
            variant={activeApp.status === "completed" ? "default" : "secondary"}
            className={cn(
              "ml-2",
              activeApp.status === "completed" &&
                "bg-success/10 text-success border-success/30"
            )}
          >
            {activeApp.status === "completed" ? "Completed" : "Draft"}
          </Badge>
        )}
      </nav>

      <div className="card-elevated p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="about-yourself" className="text-base font-medium">
            Tell us about yourself
          </Label>
          <p className="text-sm text-muted-foreground">
            Share your background, experience, goals, and what you hope to
            contribute to Tech Fleet. This is your chance to introduce yourself.
          </p>
          <Textarea
            id="about-yourself"
            value={aboutYourself}
            onChange={(e) => setAboutYourself(e.target.value)}
            placeholder="I'm a software engineer with 3 years of experience…"
            className="min-h-[200px] resize-y"
            maxLength={5000}
            aria-describedby="about-yourself-count"
          />
          <p
            id="about-yourself-count"
            className="text-xs text-muted-foreground text-right"
          >
            {aboutYourself.length} / 5,000
          </p>
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving…" : "Save Draft"}
        </Button>
        <Button
          onClick={() => handleSave(true)}
          disabled={saving || !aboutYourself.trim()}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {saving ? "Submitting…" : "Submit Application"}
        </Button>
      </div>
    </div>
  );
}

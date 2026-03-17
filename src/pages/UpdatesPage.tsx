import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Megaphone,
  Plus,
  Trash2,
  LayoutList,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { AnnouncementService, type Announcement } from "@/services/announcement.service";
import { RichTextEditor } from "@/components/RichTextEditor";

type ViewMode = "table" | "card";

export default function UpdatesPage() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const data = await AnnouncementService.list();
      setAnnouncements(data);
    } catch {
      toast.error("Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!newBody.trim() || newBody === "<p></p>") {
      toast.error("Announcement body is required.");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const announcement = await AnnouncementService.create(newTitle.trim(), newBody, user.id);
      toast.success("Announcement posted!");
      setCreateOpen(false);
      setNewTitle("");
      setNewBody("");
      // Send email notifications in background
      AnnouncementService.sendNotifications(announcement.id).catch(() => {
        // Silently fail — emails are best-effort
      });
      await fetchAnnouncements();
    } catch {
      toast.error("Failed to create announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await AnnouncementService.remove(deleteTarget.id);
      toast.success("Announcement deleted.");
      setDeleteTarget(null);
      await fetchAnnouncements();
    } catch {
      toast.error("Failed to delete announcement.");
    } finally {
      setDeleting(false);
    }
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <div className="container-app py-8 sm:py-12 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Updates</h1>
          <p className="text-muted-foreground mt-1">Stay informed with the latest announcements.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("table")}
              aria-label="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("card")}
              aria-label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Announcement
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-20">
          <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No announcements yet.</p>
        </div>
      ) : viewMode === "table" ? (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">Title</TableHead>
                <TableHead className="w-[30%]">Preview</TableHead>
                <TableHead className="w-[15%]">Date</TableHead>
                {isAdmin && <TableHead className="w-[10%] text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedAnnouncement(a)}
                >
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm truncate max-w-[200px]">
                    {stripHtml(a.body_html).slice(0, 80)}
                    {stripHtml(a.body_html).length > 80 ? "…" : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {format(new Date(a.created_at), "MMM d, yyyy")}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(a);
                        }}
                        aria-label={`Delete ${a.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAnnouncement(a)}
              className="card-elevated p-5 text-left hover:border-primary/40 transition-all group border border-white/50"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {a.title}
                </h3>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(a);
                    }}
                    aria-label={`Delete ${a.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                {stripHtml(a.body_html).slice(0, 150)}
              </p>
              <Badge variant="secondary" className="text-xs">
                {format(new Date(a.created_at), "MMM d, yyyy")}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Detail side panel */}
      <Sheet open={!!selectedAnnouncement} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="text-xl pr-8">{selectedAnnouncement?.title}</SheetTitle>
            <SheetDescription>
              {selectedAnnouncement && format(new Date(selectedAnnouncement.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6 py-4">
            {selectedAnnouncement && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedAnnouncement.body_html }}
              />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
            <DialogDescription>
              Create an announcement that will be visible to all members. Opted-in members will receive an email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-auto py-2">
            <div className="space-y-1.5">
              <Label htmlFor="announcement-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="announcement-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. New Training Cohort Starting March 25"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Content <span className="text-destructive">*</span></Label>
              <RichTextEditor
                content={newBody}
                onChange={setNewBody}
                placeholder="Write your announcement here..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Posting…" : "Post Announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

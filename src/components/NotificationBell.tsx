import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Video, Mic } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLatestAnnouncements,
  useAnnouncementReadIds,
  useMarkAnnouncementRead,
} from "@/hooks/use-announcements";
import { stripHtml } from "@/lib/html";
import type { Announcement } from "@/services/announcement.service";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const { data: announcements = [] } = useLatestAnnouncements(20);
  const { data: readIds = new Set<string>() } = useAnnouncementReadIds();
  const markRead = useMarkAnnouncementRead();

  const unread = announcements.filter((a) => !readIds.has(a.id));
  const unreadCount = unread.length;

  const handleClick = (announcement: Announcement) => {
    markRead.mutate(announcement.id);
    setOpen(false);
    setSelectedAnnouncement(announcement);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
                aria-hidden="true"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {unreadCount} unread announcement{unreadCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <ScrollArea className="max-h-80">
            {unread.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                All caught up! 🎉
              </div>
            ) : (
              <div className="divide-y">
                {unread.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleClick(a)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {a.video_url && <Video className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Video" />}
                        {!a.video_url && a.audio_url && <Mic className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Audio" />}
                        <h4 className="text-sm font-medium text-foreground line-clamp-1">
                          {a.title}
                        </h4>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {format(new Date(a.created_at), "MMM d")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {stripHtml(a.body_html).slice(0, 100)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
          {unread.length > 0 && (
            <div className="border-t px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setOpen(false);
                  navigate("/updates");
                }}
              >
                View all updates
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Inline side panel for viewing announcement */}
      <Sheet open={!!selectedAnnouncement} onOpenChange={(o) => !o && setSelectedAnnouncement(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="text-xl pr-8">{selectedAnnouncement?.title}</SheetTitle>
            <SheetDescription>
              {selectedAnnouncement && format(new Date(selectedAnnouncement.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6 py-4 space-y-4">
            {selectedAnnouncement?.video_url && (
              <video
                src={selectedAnnouncement.video_url}
                controls
                playsInline
                className="w-full rounded-lg aspect-video bg-black mb-4"
                aria-label="Announcement video"
              />
            )}
            {!selectedAnnouncement?.video_url && selectedAnnouncement?.audio_url && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 mb-4">
                <Mic className="h-5 w-5 text-primary shrink-0" />
                <audio
                  src={selectedAnnouncement.audio_url}
                  controls
                  className="w-full h-10"
                  aria-label="Announcement audio"
                />
              </div>
            )}
            {selectedAnnouncement && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedAnnouncement.body_html }}
              />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

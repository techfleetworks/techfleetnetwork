import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Video, Mic, Rocket, CheckCheck } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLatestAnnouncements,
  useAnnouncementReadIds,
  useMarkAnnouncementRead,
} from "@/hooks/use-announcements";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type AppNotification,
} from "@/hooks/use-notifications";
import { stripHtml } from "@/lib/html";
import type { Announcement } from "@/services/announcement.service";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  // Announcements
  const { data: announcements = [] } = useLatestAnnouncements(20);
  const { data: readIds = new Set<string>() } = useAnnouncementReadIds();
  const markAnnouncementRead = useMarkAnnouncementRead();

  // In-app notifications
  const { data: notifications = [] } = useNotifications(20);
  const { data: unreadNotifCount = 0 } = useUnreadNotificationCount();
  const markNotifRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadAnnouncements = announcements.filter((a) => !readIds.has(a.id));
  const totalUnread = unreadAnnouncements.length + unreadNotifCount;

  const handleAnnouncementClick = (announcement: Announcement) => {
    markAnnouncementRead.mutate(announcement.id);
    setOpen(false);
    setSelectedAnnouncement(announcement);
  };

  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.read) markNotifRead.mutate(notif.id);
    setOpen(false);
    if (notif.link_url) {
      navigate(notif.link_url);
    } else {
      setSelectedNotification(notif);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications${totalUnread > 0 ? `, ${totalUnread} unread` : ""}`}
          >
            <Bell className="h-5 w-5" />
            {totalUnread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
                aria-hidden="true"
              >
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
          <Tabs defaultValue="alerts" className="w-full">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <TabsList className="h-7">
                <TabsTrigger value="alerts" className="text-xs px-2 py-0.5 gap-1">
                  Alerts
                  {unreadNotifCount > 0 && (
                    <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1 min-w-3.5 h-3.5 flex items-center justify-center">
                      {unreadNotifCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="updates" className="text-xs px-2 py-0.5 gap-1">
                  Updates
                  {unreadAnnouncements.length > 0 && (
                    <span className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1 min-w-3.5 h-3.5 flex items-center justify-center">
                      {unreadAnnouncements.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Alerts tab — in-app notifications */}
            <TabsContent value="alerts" className="mt-0">
              <ScrollArea className="max-h-80">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No alerts yet
                  </div>
                ) : (
                  <div className="divide-y">
                    {notifications.slice(0, 20).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {n.notification_type === "project_opening" && (
                              <Rocket className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Project opening" />
                            )}
                            <h4 className={`text-sm font-medium line-clamp-1 ${n.read ? "text-muted-foreground" : "text-foreground"}`}>
                              {n.title}
                            </h4>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!n.read && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
                            )}
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {format(new Date(n.created_at), "MMM d")}
                            </span>
                          </div>
                        </div>
                        <div
                          className="text-xs text-muted-foreground mt-0.5 line-clamp-2 [&_strong]:font-semibold"
                          dangerouslySetInnerHTML={{ __html: stripHtml(n.body_html).slice(0, 120) }}
                        />
                        {n.link_url && (
                          <span className="text-xs text-primary font-medium mt-1 inline-block">
                            View Project →
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              {notifications.some((n) => !n.read) && (
                <div className="border-t px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    onClick={() => {
                      markAllRead.mutate();
                    }}
                    disabled={markAllRead.isPending}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all as read
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Updates tab — announcements */}
            <TabsContent value="updates" className="mt-0">
              <ScrollArea className="max-h-80">
                {unreadAnnouncements.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    All caught up! 🎉
                  </div>
                ) : (
                  <div className="divide-y">
                    {unreadAnnouncements.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => handleAnnouncementClick(a)}
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
              {unreadAnnouncements.length > 0 && (
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
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      {/* Announcement detail panel */}
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

      {/* Notification detail panel (for notifications without a link) */}
      <Sheet open={!!selectedNotification} onOpenChange={(o) => !o && setSelectedNotification(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="text-xl pr-8">{selectedNotification?.title}</SheetTitle>
            <SheetDescription>
              {selectedNotification && format(new Date(selectedNotification.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6 py-4">
            {selectedNotification && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedNotification.body_html }}
              />
            )}
            {selectedNotification?.link_url && (
              <Button
                className="mt-4"
                onClick={() => {
                  setSelectedNotification(null);
                  navigate(selectedNotification.link_url);
                }}
              >
                View Project Opening
              </Button>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

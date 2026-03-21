import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationService, type AppNotification } from "@/services/notification.service";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, user?.id, limit],
    queryFn: () => NotificationService.list(user!.id, limit),
    enabled: !!user,
    refetchInterval: 30_000,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count", user?.id],
    queryFn: () => NotificationService.unreadCount(user!.id),
    enabled: !!user,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => NotificationService.markRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Not authenticated");
      return NotificationService.markAllRead(user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

/** Subscribe to realtime INSERT events on the notifications table */
export function useNotificationRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

          const newNotif = payload.new as Record<string, unknown>;
          const title = typeof newNotif?.title === "string" ? newNotif.title : "New notification";
          toast.info(title, {
            description: "Tap the bell to view details.",
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}

export type { AppNotification };

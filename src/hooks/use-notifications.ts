import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationService, type AppNotification } from "@/services/notification.service";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NOTIFICATIONS_KEY = ["notifications"] as const;

/**
 * Adaptive polling interval for notification queries.
 * Uses React state so interval changes trigger re-renders (fixes stale ref bug).
 * Backs off to 4× base interval when the tab is hidden.
 */
function useAdaptiveInterval(baseMs: number): number {
  const [hidden, setHidden] = useState(document.hidden);

  const handler = useCallback(() => setHidden(document.hidden), []);

  useEffect(() => {
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [handler]);

  return hidden ? baseMs * 4 : baseMs;
}

export function useNotifications(limit = 50) {
  const { user } = useAuth();
  const interval = useAdaptiveInterval(30_000);

  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, user?.id, limit],
    queryFn: () => NotificationService.list(user!.id, limit),
    enabled: !!user,
    refetchInterval: interval,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  const interval = useAdaptiveInterval(30_000);

  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count", user?.id],
    queryFn: () => NotificationService.unreadCount(user!.id),
    enabled: !!user,
    refetchInterval: interval,
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

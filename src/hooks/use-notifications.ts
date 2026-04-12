/**
 * Notification hooks — optimized for 10,000+ concurrent users.
 *
 * Key enterprise optimizations:
 * - Single query for both list + unread count (eliminates redundant DB call)
 * - Adaptive polling (4× slower when tab hidden)
 * - Realtime subscription for instant delivery
 * - Optimistic updates on mark-read mutations
 * - Proper staleTime to prevent refetch storms
 */
import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationService, type AppNotification } from "@/services/notification.service";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdaptiveInterval } from "@/hooks/use-adaptive-interval";

const NOTIFICATIONS_KEY = ["notifications"] as const;

/**
 * Primary hook: fetches the notification list. Unread count is derived
 * from the same data to avoid a second DB round-trip per poll cycle.
 */
export function useNotifications(limit = 50) {
  const { user } = useAuth();
  const interval = useAdaptiveInterval(30_000);

  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, user?.id, limit],
    queryFn: () => NotificationService.list(user!.id, limit),
    enabled: !!user,
    refetchInterval: interval,
    staleTime: 15_000, // 15s — avoid refetching within the same poll cycle
  });
}

/**
 * Derived unread count — computed from the notification list query cache.
 * Eliminates the separate `unreadCount` DB query that was polling every 30s.
 */
export function useUnreadNotificationCount() {
  const { data: notifications } = useNotifications();

  return useMemo(() => {
    if (!notifications) return 0;
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => NotificationService.markRead(notificationId),
    // Optimistic update — mark as read in cache immediately
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.setQueriesData<AppNotification[]>(
        { queryKey: NOTIFICATIONS_KEY },
        (old) => old?.map((n) => n.id === notificationId ? { ...n, read: true } : n),
      );
    },
    onSettled: () => {
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
    // Optimistic update — mark all as read in cache immediately
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.setQueriesData<AppNotification[]>(
        { queryKey: NOTIFICATIONS_KEY },
        (old) => old?.map((n) => ({ ...n, read: true })),
      );
    },
    onSettled: () => {
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

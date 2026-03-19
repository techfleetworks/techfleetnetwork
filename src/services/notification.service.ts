import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("NotificationService");

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body_html: string;
  notification_type: string;
  link_url: string;
  read: boolean;
  created_at: string;
}

export const NotificationService = {
  /** Fetch the latest in-app notifications for the current user */
  async list(userId: string, limit = 50): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, title, body_html, notification_type, link_url, read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      log.warn("list", `Failed to fetch notifications: ${error.message}`, { userId }, error);
      return [];
    }
    return (data as unknown as AppNotification[]) || [];
  },

  /** Count unread notifications */
  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) {
      log.warn("unreadCount", `Failed to count unread: ${error.message}`, { userId }, error);
      return 0;
    }
    return count ?? 0;
  },

  /** Mark a single notification as read */
  async markRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("id", notificationId);

    if (error) {
      log.warn("markRead", `Failed to mark notification read: ${error.message}`, { notificationId }, error);
    }
  },

  /** Mark all notifications as read for a user */
  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("user_id", userId)
      .eq("read", false);

    if (error) {
      log.warn("markAllRead", `Failed to mark all read: ${error.message}`, { userId }, error);
    }
  },
};

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("AnnouncementService");

export interface Announcement {
  id: string;
  title: string;
  body_html: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export const AnnouncementService = {
  async list(limit = 50): Promise<Announcement[]> {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      log.error("list", `Failed to fetch announcements: ${error.message}`, {}, error);
      throw new Error("Failed to load announcements.");
    }
    return (data ?? []) as unknown as Announcement[];
  },

  async latest(limit = 5): Promise<Announcement[]> {
    return this.list(limit);
  },

  async create(title: string, bodyHtml: string, userId: string): Promise<Announcement> {
    const { data, error } = await supabase
      .from("announcements")
      .insert({ title, body_html: bodyHtml, created_by: userId } as any)
      .select()
      .single();
    if (error) {
      log.error("create", `Failed to create announcement: ${error.message}`, {}, error);
      throw new Error("Failed to create announcement.");
    }
    return data as unknown as Announcement;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id);
    if (error) {
      log.error("remove", `Failed to delete announcement: ${error.message}`, {}, error);
      throw new Error("Failed to delete announcement.");
    }
  },

  async sendNotifications(announcementId: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const { error } = await supabase.functions.invoke("send-announcement-email", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { announcement_id: announcementId },
    });
    if (error) {
      log.warn("sendNotifications", `Email notification failed: ${error.message}`, {}, error);
    }
  },
};

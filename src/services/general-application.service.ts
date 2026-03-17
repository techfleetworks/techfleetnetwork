import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("GeneralApplicationService");

export interface GeneralApplication {
  id: string;
  user_id: string;
  status: string;
  title: string;
  about_yourself: string;
  created_at: string;
  updated_at: string;
}

export const GeneralApplicationService = {
  /** Fetch all general applications for a user, newest first */
  async list(userId: string): Promise<GeneralApplication[]> {
    return log.track("list", `Listing general apps for user ${userId}`, { userId }, async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) {
        log.error("list", `Failed to list general apps: ${error.message}`, { userId }, error);
        throw new Error("Failed to load applications.");
      }
      return (data ?? []) as unknown as GeneralApplication[];
    });
  },

  /** Fetch a single application by ID */
  async fetch(id: string): Promise<GeneralApplication | null> {
    return log.track("fetch", `Fetching general app ${id}`, { id }, async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        log.warn("fetch", `General app not found: ${error.message}`, { id }, error);
        return null;
      }
      return data as unknown as GeneralApplication;
    });
  },

  /** Create a new draft application */
  async create(userId: string, prefill?: Partial<Pick<GeneralApplication, "about_yourself">>): Promise<GeneralApplication> {
    return log.track("create", `Creating general app for user ${userId}`, { userId }, async () => {
      const insertData: Record<string, unknown> = {
        user_id: userId,
        status: "draft",
        about_yourself: prefill?.about_yourself ?? "",
      };
      const { data, error } = await supabase
        .from("general_applications")
        .insert(insertData as any)
        .select()
        .single();
      if (error) {
        log.error("create", `Failed to create general app: ${error.message}`, { userId }, error);
        throw new Error("Failed to create application.");
      }
      return data as unknown as GeneralApplication;
    });
  },

  /** Save progress (update fields) */
  async save(id: string, fields: Partial<Pick<GeneralApplication, "about_yourself" | "status" | "title">>): Promise<void> {
    return log.track("save", `Saving general app ${id}`, { id, fields: Object.keys(fields) }, async () => {
      const { error } = await supabase
        .from("general_applications")
        .update(fields as any)
        .eq("id", id);
      if (error) {
        log.error("save", `Failed to save general app: ${error.message}`, { id }, error);
        throw new Error("Failed to save application.");
      }
    });
  },

  /** Delete an application */
  async remove(id: string): Promise<void> {
    return log.track("remove", `Deleting general app ${id}`, { id }, async () => {
      const { error } = await supabase
        .from("general_applications")
        .delete()
        .eq("id", id);
      if (error) {
        log.error("remove", `Failed to delete general app: ${error.message}`, { id }, error);
        throw new Error("Failed to delete application.");
      }
    });
  },

  /** Get the most recently completed application for prefill */
  async getLatestCompleted(userId: string): Promise<GeneralApplication | null> {
    return log.track("getLatestCompleted", `Fetching latest completed app for user ${userId}`, { userId }, async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        log.warn("getLatestCompleted", `Query failed: ${error.message}`, { userId }, error);
        return null;
      }
      return data as unknown as GeneralApplication | null;
    });
  },
};

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("GeneralApplicationService");

/** Fire-and-forget sync to Airtable via edge function */
async function syncToAirtable(app: GeneralApplication): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      error?: string;
      airtable_id?: string | null;
    }>("sync-airtable", {
      body: {
        application_id: app.id,
        title: app.title,
        about_yourself: app.about_yourself,
        status: app.status,
        created_at: app.created_at,
        updated_at: app.updated_at,
      },
    });

    if (error) {
      log.warn("syncToAirtable", `Airtable sync request failed: ${error.message}`, { appId: app.id }, error);
      return;
    }

    if (!data?.success) {
      log.warn("syncToAirtable", `Airtable sync failed: ${data?.error ?? "Unknown error"}`, { appId: app.id });
      return;
    }

    log.info("syncToAirtable", `Synced app ${app.id} to Airtable`, {
      appId: app.id,
      airtableId: data.airtable_id ?? null,
    });
  } catch (err) {
    log.warn("syncToAirtable", "Airtable sync error (non-blocking)", { appId: app.id }, err);
  }
}

export interface GeneralApplication {
  id: string;
  user_id: string;
  email: string;
  status: string;
  title: string;
  about_yourself: string;
  created_at: string;
  updated_at: string;
}

/** Fetch the user's email from their profile */
async function getProfileEmail(userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", userId)
    .single();
  return data?.email ?? "";
}

/** Sync the about_yourself text to the profile's professional_background */
async function syncToProfileBackground(userId: string, aboutYourself: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ professional_background: aboutYourself } as any)
      .eq("user_id", userId);
    if (error) {
      log.warn("syncToProfileBackground", `Failed to sync background: ${error.message}`, { userId }, error);
    }
  } catch (err) {
    log.warn("syncToProfileBackground", "Background sync error (non-blocking)", { userId }, err);
  }
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
      const email = await getProfileEmail(userId);
      const insertData: Record<string, unknown> = {
        user_id: userId,
        email,
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

  /** Save progress (update fields) and sync to Airtable */
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
      // Fetch updated record and sync to Airtable (non-blocking)
      const updated = await GeneralApplicationService.fetch(id);
      if (updated) {
        syncToAirtable(updated).catch(() => {});
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

import { supabase } from "@/integrations/supabase/client";
import type { ClassFormValues } from "@/lib/validators/class";

export type ClassRow = {
  id: string;
  owner_user_id: string;
  title: string;
  slug: string;
  track: "basic_training" | "advanced_training";
  status: "draft" | "pending_review" | "published" | "archived";
  summary: string;
  description: string | null;
  hero_image_url: string | null;
  skills: string[];
  outcomes: string[];
  prerequisites: string[];
  submitted_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
};

export const ClassService = {
  async listPublishedByTrack(track: ClassRow["track"]): Promise<ClassRow[]> {
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .eq("status", "published")
      .eq("track", track)
      .order("published_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ClassRow[];
  },

  async listMine(ownerId: string): Promise<ClassRow[]> {
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .eq("owner_user_id", ownerId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ClassRow[];
  },

  async listAll(): Promise<ClassRow[]> {
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ClassRow[];
  },

  async getById(id: string): Promise<ClassRow | null> {
    const { data, error } = await supabase.from("classes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data ?? null) as ClassRow | null;
  },

  async getBySlug(slug: string): Promise<ClassRow | null> {
    const { data, error } = await supabase.from("classes").select("*").eq("slug", slug).maybeSingle();
    if (error) throw error;
    return (data ?? null) as ClassRow | null;
  },

  async create(ownerId: string, values: ClassFormValues): Promise<string> {
    const { data, error } = await supabase
      .from("classes")
      .insert({
        owner_user_id: ownerId,
        title: values.title,
        summary: values.summary,
        description: values.description ?? null,
        track: values.track,
        hero_image_url: values.hero_image_url || null,
        skills: values.skills,
        outcomes: values.outcomes,
        prerequisites: values.prerequisites,
        slug: "", // server trigger will populate
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  },

  async update(id: string, values: Partial<ClassFormValues>): Promise<void> {
    const payload: Record<string, unknown> = { ...values };
    if (values.hero_image_url === "") payload.hero_image_url = null;
    const { error } = await supabase.from("classes").update(payload).eq("id", id);
    if (error) throw error;
  },

  async submitForReview(id: string): Promise<void> {
    const { error } = await (supabase as any).rpc("submit_class_for_review", { _class_id: id });
    if (error) throw error;
  },

  async approveAndPublish(id: string): Promise<void> {
    const { error } = await (supabase as any).rpc("approve_and_publish_class", { _class_id: id });
    if (error) throw error;
  },

  async requestChanges(id: string, reason: string): Promise<void> {
    const { error } = await (supabase as any).rpc("request_class_changes", { _class_id: id, _reason: reason });
    if (error) throw error;
  },

  async archive(id: string, reason?: string): Promise<void> {
    const { error } = await (supabase as any).rpc("archive_class", { _class_id: id, _reason: reason ?? null });
    if (error) throw error;
  },

  async follow(classId: string, userId: string): Promise<void> {
    const { error } = await supabase.from("class_followers").insert({ class_id: classId, user_id: userId } as never);
    if (error && !String(error.message).includes("duplicate")) throw error;
  },

  async unfollow(classId: string, userId: string): Promise<void> {
    const { error } = await supabase.from("class_followers").delete().eq("class_id", classId).eq("user_id", userId);
    if (error) throw error;
  },

  async isFollowing(classId: string, userId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from("class_followers")
      .select("id", { head: true, count: "exact" })
      .eq("class_id", classId)
      .eq("user_id", userId);
    if (error) throw error;
    return (count ?? 0) > 0;
  },
};

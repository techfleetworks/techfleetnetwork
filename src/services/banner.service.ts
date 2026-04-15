/**
 * Banner Service
 * CRUD operations for admin-managed system banners.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AdminBanner {
  id: string;
  title: string;
  body_html: string;
  status: "draft" | "published" | "archived";
  reopen_after_dismiss: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BannerInsert {
  title: string;
  body_html: string;
  status: "draft" | "published" | "archived";
  reopen_after_dismiss: boolean;
  created_by: string;
}

export interface BannerUpdate {
  title?: string;
  body_html?: string;
  status?: "draft" | "published" | "archived";
  reopen_after_dismiss?: boolean;
}

export async function fetchAllBanners(): Promise<AdminBanner[]> {
  const { data, error } = await supabase
    .from("admin_banners")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminBanner[];
}

export async function fetchPublishedBanners(): Promise<AdminBanner[]> {
  const { data, error } = await supabase
    .from("admin_banners")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminBanner[];
}

export async function createBanner(banner: BannerInsert): Promise<AdminBanner> {
  const { data, error } = await supabase
    .from("admin_banners")
    .insert(banner)
    .select()
    .single();
  if (error) throw error;
  return data as AdminBanner;
}

export async function updateBanner(id: string, updates: BannerUpdate): Promise<AdminBanner> {
  const { data, error } = await supabase
    .from("admin_banners")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AdminBanner;
}

export async function deleteBanner(id: string): Promise<void> {
  const { error } = await supabase
    .from("admin_banners")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Fetch banner IDs dismissed by the current user */
export async function fetchDismissedBannerIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("banner_dismissals")
    .select("banner_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((d: { banner_id: string }) => d.banner_id);
}

/** Dismiss a banner for the current user */
export async function dismissBanner(bannerId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("banner_dismissals")
    .upsert({ banner_id: bannerId, user_id: userId }, { onConflict: "banner_id,user_id" });
  if (error) throw error;
}

/** Un-dismiss (used when reopen_after_dismiss resets) */
export async function undismissBanner(bannerId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("banner_dismissals")
    .delete()
    .eq("banner_id", bannerId)
    .eq("user_id", userId);
  if (error) throw error;
}

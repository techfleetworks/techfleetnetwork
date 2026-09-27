import { supabase } from "@/integrations/supabase/client";
import { getUserSafe } from "@/lib/auth/session-port";
import type { CohortFormValues, CohortRegistrationStatus } from "@/lib/validators/cohort";
import { assertWritten } from "@/lib/db-helpers";
import { retryTransientWrite } from "@/lib/db/retry";
import { retryPostgrest } from "@/lib/data/transient-retry";

export type CohortRow = {
  id: string;
  class_id: string;
  label: string;
  start_date: string;
  end_date: string;
  timezone: string;
  registration_url: string;
  meeting_url: string | null;
  capacity: number | null;
  status: "draft" | "pending_review" | "published" | "archived" | "cancelled";
  registration_status: CohortRegistrationStatus;
  schedule: string;
  submitted_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** The parent-class columns the standalone Cohorts table needs (title, track, publish status, owner). */
export type CohortClassInfo = {
  id: string;
  title: string;
  track: "basic_training" | "advanced_training";
  status: "draft" | "pending_review" | "published" | "archived";
  owner_user_id: string;
};

/** A cohort plus its parent class — the row shape for the cross-class Cohorts management table. */
export type CohortWithClass = CohortRow & { class: CohortClassInfo };

export const CohortService = {
  async listByClass(classId: string): Promise<CohortRow[]> {
    const { data, error } = await retryPostgrest(() =>
      supabase
        .from("cohorts")
        .select("*")
        .eq("class_id", classId)
        .order("start_date", { ascending: true })
    );
    if (error) throw error;
    return (data ?? []) as CohortRow[];
  },

  async listPublishedByClass(classId: string): Promise<CohortRow[]> {
    const { data, error } = await retryPostgrest(() =>
      supabase
        .from("cohorts")
        .select("*")
        .eq("class_id", classId)
        .eq("status", "published")
        .order("start_date", { ascending: true })
    );
    if (error) throw error;
    return (data ?? []) as CohortRow[];
  },

  async getById(id: string): Promise<CohortRow | null> {
    const { data, error } = await retryPostgrest(() =>
      supabase.from("cohorts").select("*").eq("id", id).maybeSingle()
    );
    if (error) throw error;
    return (data ?? null) as CohortRow | null;
  },

  async create(classId: string, values: CohortFormValues): Promise<string> {
    return retryTransientWrite(async () => {
      const { data, error } = await supabase
        .from("cohorts")
        .insert({
          class_id: classId,
          label: values.label,
          start_date: values.start_date,
          end_date: values.end_date,
          registration_url: values.registration_url,
          meeting_url: values.meeting_url || null,
          timezone: values.timezone || "America/New_York",
          capacity: values.capacity ?? null,
          schedule: values.schedule ?? "",
        } as never)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "Cohort was not created. This usually means your role can't insert this row — refresh and try again or contact an admin."
        );
      }
      return (data as { id: string }).id;
    });
  },

  async update(id: string, values: Partial<CohortFormValues>): Promise<void> {
    const payload: Record<string, unknown> = { ...values };
    if (values.meeting_url === "") payload.meeting_url = null;
    await retryTransientWrite(async () => {
      const result = await supabase.from("cohorts").update(payload).eq("id", id).select("id");
      if (result.error) throw result.error;
      assertWritten(result, "cohort.update", { id });
    });
  },

  async submitForReview(classId: string, cohortIds: string[] = []): Promise<void> {
    // Cohorts are co-submitted alongside the class via submit_class_for_review.
    const { error } = await (supabase as any).rpc("submit_class_for_review", {
      p_class_id: classId,
      p_cohort_ids: cohortIds,
    });
    if (error) throw error;
  },

  async cancel(id: string, reason?: string): Promise<void> {
    const { error } = await (supabase as any).rpc("cancel_cohort", {
      p_cohort_id: id,
      p_reason: reason ?? null,
    });
    if (error) throw error;
  },

  /**
   * Set the cohort's registration status (Coming Soon / Register Now / Live / Finished).
   * Goes through the SECURITY DEFINER RPC (owner-or-admin), not a table update, because the
   * table UPDATE policy only lets owners write draft|pending_review cohorts — registration_status
   * must be settable after publication (that is when a cohort goes Live/Finished). See migration
   * 20260926120000_cohort_registration_status.sql.
   */
  async setRegistrationStatus(cohortId: string, status: CohortRegistrationStatus): Promise<void> {
    const { error } = await (supabase as any).rpc("set_cohort_registration_status", {
      p_cohort_id: cohortId,
      p_status: status,
    });
    if (error) throw error;
  },

  /**
   * All cohorts the current user may manage, each with its parent class — the data for the standalone
   * Cohorts tab in Class Admin. Row scoping is done by RLS ("Teachers can view their cohorts" /
   * "Admins can view all cohorts"), so this single query returns the teacher's own or every cohort
   * depending on role — no owner filter here.
   *
   * NOTE: bounded by PostgREST's max-rows. Cohort totals are far below that today; if they ever
   * approach it, move to a keyset-paginated RPC (see admin_list_users). The explicit range makes the
   * bound visible rather than silently capping at the default (the User Admin roster lesson).
   */
  async listForScope(): Promise<CohortWithClass[]> {
    const { data, error } = await retryPostgrest(() =>
      supabase
        .from("cohorts")
        .select("*, class:classes!inner(id,title,track,status,owner_user_id)")
        .order("start_date", { ascending: false })
        .range(0, 4999)
    );
    if (error) throw error;
    return (data ?? []) as unknown as CohortWithClass[];
  },

  /**
   * Delete a cohort through the owner-or-admin SECURITY DEFINER RPC (ADR-0063). The RPC hard-deletes
   * an empty, unpublished cohort but SOFT-cancels one that has registrations or is published, so
   * registration history is never silently dropped. Returns which happened so the UI can say so.
   * Mirrors the other cohort mutation wrappers (throws on error; satisfies no-dropped-supabase-error).
   */
  async remove(cohortId: string): Promise<"deleted" | "cancelled"> {
    const { data, error } = await (supabase as any).rpc("delete_cohort", {
      p_cohort_id: cohortId,
    });
    if (error) throw error;
    return data as "deleted" | "cancelled";
  },

  async recordRegistrationClick(cohortId: string, referrer?: string): Promise<void> {
    const user = await getUserSafe();
    const userId = user?.id;
    if (!userId) return;
    const { error } = await (supabase as any).rpc("register_for_cohort_click", {
      _cohort_id: cohortId,
      _referrer: referrer ?? null,
    });
    if (error) throw error;
  },
};

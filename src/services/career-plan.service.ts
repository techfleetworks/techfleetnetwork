// Career Plan service — talks to the generate-career-plan edge function and reads
// the user's plan + items via RLS-protected tables.
import { supabase } from "@/integrations/supabase/client";
import type { FrameworkEntity } from "./framework.service";

export type PlanItemType = "skill" | "practice" | "activity" | "deliverable" | "milestone" | "resource" | "duty";
export type PlanItemStatus = "not_started" | "in_progress" | "done";

export interface CareerPlan {
  id: string;
  user_id: string;
  target_job_title_id: string | null;
  target_specialization_id: string | null;
  target_role_id: string | null;
  current_skills: Array<{ id: string; rating: number }>;
  current_practices: Array<{ id: string; rating: number }>;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CareerPlanItem {
  id: string;
  plan_id: string;
  item_type: PlanItemType;
  reference_id: string;
  priority: number;
  status: PlanItemStatus;
  auto_generated: boolean;
  rationale: string;
}

export interface GeneratePayload {
  target_job_title_id?: string | null;
  target_specialization_id?: string | null;
  target_role_id?: string | null;
  current_skills?: Array<{ id: string; rating: number }>;
  current_practices?: Array<{ id: string; rating: number }>;
  notes?: string;
}

export async function getMyCareerPlan(): Promise<{ plan: CareerPlan | null; items: CareerPlanItem[] }> {
  const { data: plans, error } = await (supabase
    .from("career_plans" as any)
    .select("*")
    .maybeSingle() as any);
  if (error && error.code !== "PGRST116") throw error;
  const plan = (plans ?? null) as CareerPlan | null;
  if (!plan) return { plan: null, items: [] };

  const { data: items, error: itemsErr } = await (supabase
    .from("career_plan_items" as any)
    .select("*")
    .eq("plan_id", plan.id)
    .order("item_type")
    .order("priority", { ascending: false }) as any);
  if (itemsErr) throw itemsErr;
  return { plan, items: (items ?? []) as CareerPlanItem[] };
}

export async function generateCareerPlan(payload: GeneratePayload): Promise<{ plan: CareerPlan; items: CareerPlanItem[]; generated: number }> {
  const { data, error } = await supabase.functions.invoke("generate-career-plan", { body: payload });
  if (error) throw error;
  return data as { plan: CareerPlan; items: CareerPlanItem[]; generated: number };
}

export async function updatePlanItemStatus(itemId: string, status: PlanItemStatus): Promise<void> {
  const { error } = await (supabase
    .from("career_plan_items" as any)
    .update({ status })
    .eq("id", itemId) as any);
  if (error) throw error;
}

// Map plan-item type back to its FrameworkEntity (used for label lookup).
export const ITEM_TYPE_TO_ENTITY: Record<PlanItemType, FrameworkEntity> = {
  skill: "skills",
  practice: "practices",
  activity: "activities",
  deliverable: "deliverables",
  milestone: "project_milestones",
  resource: "resources",
  duty: "duties",
};

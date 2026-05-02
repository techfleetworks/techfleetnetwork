/**
 * generate-career-plan
 * --------------------
 * Deterministic career-plan generator powered by the Skills & Practices
 * Framework relationship graph. Given a user's chosen target (job title +
 * optional specialization/role) and their self-rated current skills/practices,
 * we walk `reference_relationships` and produce a checklist of items the user
 * should learn, with a stored rationale (the relationship sentence itself).
 *
 * Idempotent: repeated calls upsert by (plan_id, item_type, reference_id) so
 * status the user has already changed is preserved.
 *
 * Auth: JWT required. Operates strictly on the caller's own plan.
 */
import { handleCors, jsonResponse, methodNotAllowed, parseJsonBody } from "../_shared/http.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";
import { getAdminClient } from "../_shared/admin-client.ts";

type ItemType = "skill" | "practice" | "activity" | "deliverable" | "milestone" | "resource" | "duty";

const ENTITY_TO_ITEM_TYPE: Record<string, ItemType> = {
  skills: "skill",
  practices: "practice",
  activities: "activity",
  deliverables: "deliverable",
  project_milestones: "milestone",
  resources: "resource",
  duties: "duty",
};

const ENTITY_TABLE: Record<string, string> = {
  skills: "reference_skills",
  practices: "reference_practices",
  activities: "reference_activities",
  deliverables: "reference_deliverables",
  project_milestones: "reference_project_milestones",
  resources: "reference_resources",
  duties: "reference_duties",
};

interface Body {
  target_job_title_id?: string | null;
  target_specialization_id?: string | null;
  target_role_id?: string | null;
  current_skills?: Array<{ id: string; rating: number }>;
  current_practices?: Array<{ id: string; rating: number }>;
  notes?: string;
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function validate(body: unknown): Body | string {
  if (!body || typeof body !== "object") return "Body must be an object";
  const b = body as Body;
  if (b.target_job_title_id != null && !isUuid(b.target_job_title_id)) return "target_job_title_id must be a UUID";
  if (b.target_specialization_id != null && !isUuid(b.target_specialization_id)) return "target_specialization_id must be a UUID";
  if (b.target_role_id != null && !isUuid(b.target_role_id)) return "target_role_id must be a UUID";
  for (const arr of [b.current_skills, b.current_practices]) {
    if (arr == null) continue;
    if (!Array.isArray(arr) || arr.length > 500) return "self-rating arrays must be ≤500 items";
    for (const e of arr) {
      if (!e || !isUuid(e.id) || typeof e.rating !== "number" || e.rating < 0 || e.rating > 5) {
        return "self-rating entries must be { id: uuid, rating: 0..5 }";
      }
    }
  }
  if (b.notes != null && (typeof b.notes !== "string" || b.notes.length > 5000)) {
    return "notes must be ≤5000 chars";
  }
  return b;
}

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = await requireAuthenticatedRequest(req);
  if (auth instanceof Response) return auth;
  const userId = auth.userId;

  let raw: unknown;
  try { raw = await parseJsonBody(req); }
  catch (e) { return e instanceof Response ? e : jsonResponse({ error: "Invalid JSON" }, 400); }

  const v = validate(raw);
  if (typeof v === "string") return jsonResponse({ error: v }, 400);
  const body = v;

  const admin = getAdminClient();

  // 1. Upsert career_plans for this user.
  const { data: plan, error: planErr } = await admin
    .from("career_plans")
    .upsert({
      user_id: userId,
      target_job_title_id: body.target_job_title_id ?? null,
      target_specialization_id: body.target_specialization_id ?? null,
      target_role_id: body.target_role_id ?? null,
      current_skills: body.current_skills ?? [],
      current_practices: body.current_practices ?? [],
      notes: body.notes ?? "",
    }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (planErr || !plan) return jsonResponse({ error: planErr?.message ?? "Failed to upsert plan" }, 500);

  // 2. Determine which "from" entities anchor the plan generation.
  // We start with whichever targets the user picked: job_titles, specializations, roles.
  const anchors: Array<{ entity: string; id: string }> = [];
  if (body.target_job_title_id) anchors.push({ entity: "job_titles", id: body.target_job_title_id });
  if (body.target_specialization_id) anchors.push({ entity: "specializations", id: body.target_specialization_id });
  if (body.target_role_id) anchors.push({ entity: "roles", id: body.target_role_id });

  // 3. Pull all relationships originating FROM any anchor entity to a "learnable" entity.
  const learnableEntities = Object.keys(ENTITY_TO_ITEM_TYPE);
  const anchorEntities = [...new Set(anchors.map((a) => a.entity))];

  const { data: relationships } = await admin
    .from("reference_relationships")
    .select("from_entity, to_entity, description, inverse_description")
    .eq("is_active", true)
    .in("from_entity", anchorEntities.length ? anchorEntities : ["__none__"])
    .in("to_entity", learnableEntities);

  // Also include reverse direction (learnable -> anchor) so we can use the inverse sentence.
  const { data: reverseRels } = await admin
    .from("reference_relationships")
    .select("from_entity, to_entity, description, inverse_description")
    .eq("is_active", true)
    .in("from_entity", learnableEntities)
    .in("to_entity", anchorEntities.length ? anchorEntities : ["__none__"]);

  const targetEntities = [...new Set([
    ...(relationships ?? []).map((r) => r.to_entity),
    ...(reverseRels ?? []).map((r) => r.from_entity),
  ])];

  // 4. Build a rationale lookup: entity -> sentence describing why it's on the plan.
  const rationale: Record<string, string> = {};
  for (const r of relationships ?? []) rationale[r.to_entity] ??= r.description;
  for (const r of reverseRels ?? []) rationale[r.from_entity] ??= r.inverse_description ?? r.description;

  // 5. For each target entity, fetch all items in its reference table and create plan items
  //    for the ones the user has NOT already rated ≥3 (skills + practices).
  const ratedSkillIds = new Set((body.current_skills ?? []).filter((e) => e.rating >= 3).map((e) => e.id));
  const ratedPracticeIds = new Set((body.current_practices ?? []).filter((e) => e.rating >= 3).map((e) => e.id));

  const newItems: Array<{
    plan_id: string;
    item_type: ItemType;
    reference_id: string;
    priority: number;
    rationale: string;
    auto_generated: boolean;
  }> = [];

  for (const entity of targetEntities) {
    const tbl = ENTITY_TABLE[entity];
    const itemType = ENTITY_TO_ITEM_TYPE[entity];
    if (!tbl || !itemType) continue;

    const { data: refRows } = await admin.from(tbl).select("id, name").limit(500);
    if (!refRows) continue;

    for (const row of refRows) {
      if (entity === "skills" && ratedSkillIds.has(row.id)) continue;
      if (entity === "practices" && ratedPracticeIds.has(row.id)) continue;
      newItems.push({
        plan_id: plan.id,
        item_type: itemType,
        reference_id: row.id,
        priority: 3,
        rationale: rationale[entity] ?? `Connected to your selected target via the framework.`,
        auto_generated: true,
      });
    }
  }

  // 6. Idempotent upsert (preserves user-modified status/priority).
  if (newItems.length > 0) {
    const { error: itemsErr } = await admin
      .from("career_plan_items")
      .upsert(newItems, { onConflict: "plan_id,item_type,reference_id", ignoreDuplicates: true });
    if (itemsErr) {
      return jsonResponse({ error: `Failed to insert plan items: ${itemsErr.message}` }, 500);
    }
  }

  // 7. Return the full plan + items.
  const { data: items } = await admin
    .from("career_plan_items")
    .select("*")
    .eq("plan_id", plan.id)
    .order("item_type")
    .order("priority", { ascending: false });

  return jsonResponse({ plan, items: items ?? [], generated: newItems.length });
});

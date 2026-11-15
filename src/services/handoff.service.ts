// Client service for the Hand-Off Production System (Phases B1-B3).
// Reads go direct through the RLS-scoped Supabase client; side-effects go through the sanctioned
// edge functions (handoff-submit / handoff-produce / handoff-download) via invokeEdge. The server
// is the source of truth for validation, the strict 26-gate, and access control — this layer only
// shapes calls + types.
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge/invokeEdge";

export type HandoffPhase = "phase_1" | "phase_2" | "phase_3" | "phase_4";
export type HandoffAudience = "client" | "teammate" | "teammate_case_study" | "org_case_study";
export type HandoffLinkType = "figma" | "figjam" | "url";
export const NON_TERMINAL_STATUSES = [
  "queued",
  "parsing",
  "extracting",
  "writing",
  "rendering",
] as const;

export interface HandoffComponentStatus {
  slug: string;
  component: string;
  story_arc: string;
  complete: boolean;
}
export interface HandoffCompleteness {
  total: number;
  completed: number;
  progress_pct: number;
  is_ready: boolean;
  components: HandoffComponentStatus[];
}
export interface HandoffSubmission {
  id: string;
  component_slug: string;
  submission_type: string;
  text_content: string | null;
  external_url: string | null;
  file_name: string | null;
  created_by: string;
  created_at: string;
}
export interface HandoffProduction {
  id: string;
  project_id: string;
  phase: string;
  status: string;
  is_latest: boolean;
  error: string | null;
  gap_count: number;
  audiences: HandoffAudience[] | null;
  writer_only: boolean;
  triggered_by: string;
  created_at: string;
  updated_at: string;
}
export interface HandoffOutputFile {
  id: string;
  production_id: string;
  audience: HandoffAudience;
  format: string;
  storage_path: string;
}

export function isTerminalStatus(status: string | undefined | null): boolean {
  return status === "complete" || status === "failed" || status === "canceled";
}

/** The strict 26-component gate: progress + per-component status + is_ready. */
export async function getCompleteness(
  projectId: string,
  phase: string
): Promise<HandoffCompleteness> {
  const { data, error } = await supabase.rpc("handoff_completeness", {
    p_project_id: projectId,
    p_phase: phase,
  });
  if (error) throw error;
  return data as unknown as HandoffCompleteness;
}

export async function listSubmissions(
  projectId: string,
  phase: string
): Promise<HandoffSubmission[]> {
  const { data, error } = await supabase
    .from("handoff_deliverable_submissions")
    .select(
      "id, component_slug, submission_type, text_content, external_url, file_name, created_by, created_at"
    )
    .eq("project_id", projectId)
    .eq("phase", phase)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as HandoffSubmission[];
}

// ── Edge contract: handoff-submit (ARCH-2 — the frontend↔edge shape is verified, not assumed) ──
// Body schemas catch a client-side shape drift before the request leaves; the response schema catches
// a server-side drift on the way back — invokeEdge throws loudly (EdgeInvokeError) on either, so a
// mismatch can never pass silently. Shapes mirror supabase/functions/handoff-submit/index.ts.
const submitTextBodySchema = z
  .object({
    project_id: z.string(),
    phase: z.string(),
    component_slug: z.string(),
    type: z.literal("text"),
    text: z.string(),
  })
  .strict();
const submitLinkBodySchema = z
  .object({
    project_id: z.string(),
    phase: z.string(),
    component_slug: z.string(),
    type: z.enum(["figma", "figjam", "url"]),
    external_url: z.string(),
  })
  .strict();
// The server answers 201 `{ submission_id, completeness }`; `.passthrough()` keeps the contract to the
// fields this client reads, so a server adding a field never reds a valid response.
const submitResponseSchema = z
  .object({ submission_id: z.string(), completeness: z.object({}).passthrough() })
  .passthrough();

export async function submitText(
  projectId: string,
  phase: string,
  componentSlug: string,
  text: string
) {
  return invokeEdge("handoff-submit", {
    body: { project_id: projectId, phase, component_slug: componentSlug, type: "text", text },
    bodySchema: submitTextBodySchema,
    responseSchema: submitResponseSchema,
  });
}

export async function submitLink(
  projectId: string,
  phase: string,
  componentSlug: string,
  type: HandoffLinkType,
  url: string
) {
  return invokeEdge("handoff-submit", {
    body: { project_id: projectId, phase, component_slug: componentSlug, type, external_url: url },
    bodySchema: submitLinkBodySchema,
    responseSchema: submitResponseSchema,
  });
}

// A file upload is nothing like a text/link submit: up to 50 MB has to travel the wire, then the
// server sniffs magic bytes, writes the blob to Storage, and recomputes the 26-gate — all before it
// answers. The generic 8s invokeEdge default aborts mid-upload ("timed out in the middle of me
// uploading files"). Give uploads a generous ceiling instead. Also disable the auto-retry: invokeEdge
// aborts the *race*, not the underlying fetch (supabase-js ignores the signal), so a slow upload can
// still succeed server-side — retrying it would create a duplicate stored blob + submission row.
// Deliberately call-site, NOT edge-timeouts.ts: only the file variant is slow (submitText/submitLink
// are correctly on the 8s default), and the budget is coupled to noRetry — a per-function registry key
// can carry neither the variant scoping nor noRetry (decisions.md §8).
const FILE_UPLOAD_TIMEOUT_MS = 120_000;

export async function submitFile(
  projectId: string,
  phase: string,
  componentSlug: string,
  file: File
) {
  const form = new FormData();
  form.set("project_id", projectId);
  form.set("phase", phase);
  form.set("component_slug", componentSlug);
  form.set("type", "file");
  form.set("file", file);
  // FormData body -> supabase-js sends multipart/form-data automatically. No bodySchema here: the
  // body is multipart, not a JSON object Zod can parse — the server validates the parts. The RESPONSE
  // is the same JSON ack as text/link submits, so it carries the shared responseSchema.
  return invokeEdge("handoff-submit", {
    body: form,
    responseSchema: submitResponseSchema,
    timeoutMs: FILE_UPLOAD_TIMEOUT_MS,
    noRetry: true,
  });
}

export async function deleteSubmission(id: string): Promise<void> {
  const { error } = await supabase.from("handoff_deliverable_submissions").delete().eq("id", id);
  if (error) throw error;
}

// ── Edge contract: handoff-produce. The schema is the single source of truth for the result shape;
// `ProduceResult` is inferred from it so the type and the runtime check can never drift apart. ──
const produceBodySchema = z
  .object({
    project_id: z.string(),
    phase: z.string(),
    audiences: z
      .array(z.enum(["client", "teammate", "teammate_case_study", "org_case_study"]))
      .optional(),
  })
  .strict();
const produceResultSchema = z
  .object({ run_id: z.string(), status: z.string(), message: z.string().optional() })
  .passthrough();
export type ProduceResult = z.infer<typeof produceResultSchema>;

/**
 * Kick off async production (returns immediately; poll getLatestProduction for status). Pass
 * `audiences` to request a targeted re-create of only those versions — the server decides whether
 * it's the first full production or the team's one writer-only retry and enforces the budget.
 */
export async function produceHandoffs(
  projectId: string,
  phase: string,
  audiences?: HandoffAudience[]
): Promise<ProduceResult> {
  return invokeEdge("handoff-produce", {
    body: {
      project_id: projectId,
      phase,
      ...(audiences && audiences.length ? { audiences } : {}),
    },
    bodySchema: produceBodySchema,
    responseSchema: produceResultSchema,
  });
}

export async function getLatestProduction(
  projectId: string,
  phase: string
): Promise<HandoffProduction | null> {
  const { data, error } = await supabase
    .from("handoff_productions")
    .select(
      "id, project_id, phase, status, is_latest, error, gap_count, audiences, writer_only, triggered_by, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .eq("phase", phase)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as HandoffProduction) ?? null;
}

export async function listOutputs(productionId: string): Promise<HandoffOutputFile[]> {
  const { data, error } = await supabase
    .from("handoff_output_files")
    .select("id, production_id, audience, format, storage_path")
    .eq("production_id", productionId);
  if (error) throw error;
  return (data ?? []) as unknown as HandoffOutputFile[];
}

// ── Edge contract: handoff-download. `DownloadLink` is inferred from the response schema (one owner
// for the shape); the body carries exactly the one id the server expects. ──
const downloadBodySchema = z.object({ output_file_id: z.string() }).strict();
const downloadLinkSchema = z
  .object({ url: z.string(), format: z.string(), expires_in: z.number() })
  .passthrough();
export type DownloadLink = z.infer<typeof downloadLinkSchema>;

/** Get a short-lived, ownership-checked signed URL for one produced output file. */
export async function getDownloadUrl(outputFileId: string): Promise<DownloadLink> {
  return invokeEdge("handoff-download", {
    body: { output_file_id: outputFileId },
    bodySchema: downloadBodySchema,
    responseSchema: downloadLinkSchema,
  });
}

// ── Post-production feedback (learning signal) ───────────────────────────────
export type HandoffRating = "up" | "down";
export interface HandoffFeedback {
  id: string;
  production_id: string;
  audience: HandoffAudience;
  rating: HandoffRating;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** All feedback on a production (RLS: active members of the project). */
export async function listFeedback(productionId: string): Promise<HandoffFeedback[]> {
  const { data, error } = await supabase
    .from("handoff_feedback")
    .select("id, production_id, audience, rating, note, created_by, created_at, updated_at")
    .eq("production_id", productionId);
  if (error) throw error;
  return (data ?? []) as unknown as HandoffFeedback[];
}

/**
 * Upsert the caller's 👍/👎 (+ optional note) for one produced version. `created_by` is set by the
 * database (auth.uid()) and can't be forged; re-rating the same version overwrites the prior rating.
 */
export async function submitFeedback(
  productionId: string,
  audience: HandoffAudience,
  rating: HandoffRating,
  note?: string
): Promise<void> {
  const { error } = await supabase.from("handoff_feedback").upsert(
    {
      production_id: productionId,
      audience,
      rating,
      note: note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "production_id,audience,created_by" }
  );
  if (error) throw error;
}

// ── Production stage mapping (for the async progress stepper) ────────────────
export type HandoffStage = "extract" | "parse" | "organize" | "summarize" | "review";
export const HANDOFF_STAGES: { key: HandoffStage; label: string }[] = [
  { key: "extract", label: "Extract" },
  { key: "parse", label: "Parse" },
  { key: "organize", label: "Organize" },
  { key: "summarize", label: "Summarize" },
  { key: "review", label: "Review" },
];

/**
 * The active stage index (0..4) for a run status, mapping the pipeline's coarse statuses onto the
 * five-step Extract·Parse·Organize·Summarize·Review bar. `complete` lands on Review (ready for the
 * human); a failed/canceled run returns -1 (error state, no stage active).
 */
export function activeStageIndex(status: string | null | undefined): number {
  switch (status) {
    case "queued":
      return 0;
    case "parsing":
    case "extracting":
      return 1;
    case "writing":
    case "rendering":
      return 3;
    case "complete":
      return 4;
    case "failed":
    case "canceled":
      return -1;
    default:
      return 0;
  }
}

// ── Re-create budget (1 production + 1 team retry) ──────────────────────────
export const HANDOFF_RUN_CAP = 2;
export interface HandoffBudget {
  runs_used: number;
  can_produce: boolean; // nothing produced yet
  can_retry: boolean; // produced, the one team retry is still available
  retries_remaining: number;
}

/** PURE: derive the produce/retry affordances from the team's runs_used counter. */
export function budgetState(runsUsed: number): HandoffBudget {
  const used = Math.max(0, Math.trunc(runsUsed) || 0);
  return {
    runs_used: used,
    can_produce: used === 0,
    can_retry: used >= 1 && used < HANDOFF_RUN_CAP,
    retries_remaining: used >= 1 ? Math.max(0, HANDOFF_RUN_CAP - used) : 0,
  };
}

/** The team's re-create budget for a project+phase (RLS: active members can read). */
export async function getRunBudget(projectId: string, phase: string): Promise<HandoffBudget> {
  const { data, error } = await supabase
    .from("handoff_run_budget")
    .select("runs_used")
    .eq("project_id", projectId)
    .eq("phase", phase)
    .maybeSingle();
  if (error) throw error;
  return budgetState((data?.runs_used as number) ?? 0);
}

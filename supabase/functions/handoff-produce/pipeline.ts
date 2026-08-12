// The hand-off generation pipeline (Phase B2). Orchestration over the model port + prompts +
// assembler + renderers, driven as a RESUMABLE step machine (pipeline-steps.ts) so a long run can
// be advanced incrementally by a durable worker and survive an edge-invocation recycle. All writes
// go through a service-role client. See handoff-produce/index.ts (enqueue front door) and
// handoff-worker/index.ts (the cron-driven worker that drives runs to completion).
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createEdgeLogger } from "../_shared/logger.ts";
import { scrub as dlpScrub } from "../_shared/dlp.ts";
import { generateStructured, resolveMechanicalModel } from "../_shared/llm/port.ts";
import { buildFactExtractionPrompt, buildWriterPrompt, type ComponentFactBase } from "./prompts.ts";
import { chunkText, dedupeFacts, mergeFacts, stripTemplateItems } from "./extract.ts";
import { formatSpfContext, loadSpfContext, toExtractionScope } from "./spf-context.ts";
import {
  buildVersionOutline,
  type DeliverableLink,
  type HandoffComponent,
  renderVersionMarkdown,
  type WrittenComponent,
} from "./assemble.ts";
import { renderVersionHtml } from "./render-html.ts";
import { fetchNodesText, parseFigmaUrl } from "./figma.ts";
import {
  buildRunPlan,
  type DriveStop,
  driveRun,
  type FinalizeUnit,
  initialState,
  type PipelineState,
  type StepEffects,
  type WriteUnit,
} from "./pipeline-steps.ts";

const log = createEdgeLogger("handoff-produce");
const MAX_LLM_CALLS = 400; // per-invocation runaway guard (chunked extraction + per-arc writers)
// A writer arc (esp. a reasoning model) can legitimately run ~100s; give it room, but the port's
// deadline still bounds a hang and terminal errors (4xx / truncation / refusal) fail fast.
const WRITER_TIMEOUT_MS = 150_000;
const WRITER_DEADLINE_MS = 210_000;

// Loose client type: edge functions have no generated Database types.
type SvcClient = SupabaseClient<any, "public", any>;

export type RunContext = {
  runId: string;
  projectId: string;
  phase: string;
  spfVersion: string;
  writerModel: string;
  requestId: string;
};

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type FigmaSub = { slug: string; fileKey: string; nodeId: string };

/** PURE: turn figma-link submissions into per-file node-id fetch batches (deduped) + a slug index.
 *  Non-figma or node-less URLs are skipped (parseFigmaUrl is host-locked, so this also drops junk). */
export function planFigmaFetch(
  subs: Array<{ component_slug: string; external_url: string | null }>
): { byFile: Map<string, string[]>; subs: FigmaSub[] } {
  const seen = new Map<string, Set<string>>(); // fileKey -> node ids
  const out: FigmaSub[] = [];
  for (const s of subs) {
    if (!s.external_url) continue;
    let parsed: { fileKey: string; nodeId?: string };
    try {
      parsed = parseFigmaUrl(s.external_url);
    } catch {
      continue; // not a figma URL (or unsafe host) -> not fetched here
    }
    if (!parsed.nodeId) continue; // whole-file links aren't node-scoped; skip on the hot path
    const set = seen.get(parsed.fileKey) ?? new Set<string>();
    set.add(parsed.nodeId);
    seen.set(parsed.fileKey, set);
    out.push({ slug: s.component_slug, fileKey: parsed.fileKey, nodeId: parsed.nodeId });
  }
  return { byFile: new Map([...seen].map(([k, v]) => [k, [...v]])), subs: out };
}

/** PURE: map each component slug to the fetched node text(s) for its figma submissions. */
export function figmaMaterialBySlug(
  subs: FigmaSub[],
  nodeTextByFile: Map<string, Record<string, string[]>>
): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  for (const { slug, fileKey, nodeId } of subs) {
    const texts = nodeTextByFile.get(fileKey)?.[nodeId] ?? [];
    if (!texts.length) continue;
    const prev = bySlug.get(slug) ?? [];
    bySlug.set(slug, [...prev, ...texts]);
  }
  return bySlug;
}

/** Load the per-run context that every worker tick needs (cheap + deterministic; safe to redo). */
async function loadRunContext(svc: SvcClient, projectId: string, phase: string) {
  const { data: compRows, error: compErr } = await svc
    .from("spf_entity")
    .select("slug,data")
    .eq("entity_type", "handoff_component")
    .eq("is_active", true);
  if (compErr) throw compErr;
  const components: HandoffComponent[] = (compRows ?? []).map((r) => ({
    slug: r.slug as string,
    ...(r.data as Record<string, unknown>),
  })) as HandoffComponent[];

  const { data: subs, error: subErr } = await svc
    .from("handoff_deliverable_submissions")
    .select("component_slug,submission_type,text_content,external_url,file_name")
    .eq("project_id", projectId)
    .eq("phase", phase);
  if (subErr) throw subErr;

  const nameBySlug = new Map(components.map((c) => [c.slug, String(c.Component ?? c.slug)]));
  const byComponent = new Map<string, Array<{ kind: string; content: string }>>();
  const linkMap = new Map<string, DeliverableLink[]>(); // deep-links to the actual submitted work
  for (const s of subs ?? []) {
    const slug = s.component_slug as string;
    const list = byComponent.get(slug) ?? [];
    const content =
      (s.text_content as string) ||
      (s.external_url as string) ||
      `file: ${(s.file_name as string) ?? "uploaded"}`;
    list.push({ kind: s.submission_type as string, content });
    byComponent.set(slug, list);
    const url = s.external_url as string | null;
    if (url) {
      const links = linkMap.get(slug) ?? [];
      links.push({ label: nameBySlug.get(slug) ?? slug, url });
      linkMap.set(slug, links);
    }
  }

  // Live Figma fetch: a figma-link submission is the deep-link anchor -> pull exactly that node's
  // text (node-scoped, batched, retry-aware) and add it as extraction MATERIAL. The link itself
  // still feeds linkMap for the output's deep-links; here we read the actual board content so the
  // extractor works from the real work, not the URL string. SSRF-guarded by parseFigmaUrl.
  const figmaToken = Deno.env.get("FIGMA_TOKEN");
  if (figmaToken) {
    const { byFile, subs: figSubs } = planFigmaFetch(
      (subs ?? []).map((s) => ({
        component_slug: s.component_slug as string,
        external_url: (s.external_url as string) ?? null,
      }))
    );
    if (figSubs.length) {
      const nodeTextByFile = new Map<string, Record<string, string[]>>();
      for (const [fileKey, ids] of byFile) {
        try {
          nodeTextByFile.set(fileKey, await fetchNodesText(fileKey, ids, figmaToken));
        } catch (e) {
          log.warn(
            "figma",
            `fetch failed for file ${fileKey}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      for (const [slug, texts] of figmaMaterialBySlug(figSubs, nodeTextByFile)) {
        const list = byComponent.get(slug) ?? [];
        // Blank line BETWEEN board items (each fetched node = one sticky/cell/text) so the extractor
        // sees discrete items and keeps a single multi-line sticky whole (one quote, not one per line).
        list.push({ kind: "figma", content: texts.join("\n\n") });
        byComponent.set(slug, list);
      }
    }
  }

  const { data: proj } = await svc
    .from("projects")
    .select("current_phase_milestones")
    .eq("id", projectId)
    .maybeSingle();
  const milestones = Array.isArray(proj?.current_phase_milestones)
    ? (proj!.current_phase_milestones as string[])
    : undefined;

  const spfCtx = await loadSpfContext(svc);
  const spfStrings = new Map([...spfCtx].map(([slug, c]) => [slug, formatSpfContext(c)]));
  // Extractor SEARCH scope per component: the SPF deliverables + activities + workshops to look for.
  const spfScope = new Map([...spfCtx].map(([slug, c]) => [slug, toExtractionScope(c)]));

  return { components, byComponent, linkMap, milestones, spfStrings, spfScope };
}

/** Build the injected side effects (LLM extract, LLM write-arc, render+store) for one run. */
function buildEffects(
  svc: SvcClient,
  ctx: RunContext,
  loaded: Awaited<ReturnType<typeof loadRunContext>>,
  guardCall: () => void
): StepEffects {
  const { requestId, writerModel } = ctx;
  const mechModel = resolveMechanicalModel();
  const { byComponent, linkMap, milestones, spfStrings, spfScope } = loaded;

  const extractFacts = async (component: HandoffComponent): Promise<ComponentFactBase> => {
    const slug = component.slug;
    const name = String(component.Component ?? slug);
    const subsFor = byComponent.get(slug) ?? [];
    const scope = spfScope.get(slug); // SPF deliverables + activities + workshops to search for
    // Extract from real material only; bare-URL submissions (Figma deep-links) feed the link map.
    const material = subsFor.filter((s) => !/^https?:\/\/\S+$/.test(s.content.trim()));
    let facts: string[] = [];
    if (material.length) {
      // Read ALL of it: concatenate, drop unfilled-template noise, chunk to fit, extract per chunk,
      // then merge + dedupe. No truncation.
      const fullText = material.map((s) => s.content).join("\n\n");
      // Drop unfilled-template ITEMS (keeps real terse stickies next to "Enter here" scaffolding),
      // then chunk. No whole-chunk template filter, which used to discard real work with the noise.
      const chunks = chunkText(stripTemplateItems(fullText));
      const perChunk: string[][] = [];
      for (const chunk of chunks) {
        guardCall();
        const p = buildFactExtractionPrompt(
          name,
          String((component as Record<string, unknown>).Description ?? ""),
          [{ kind: "material", content: chunk }],
          scope
        );
        const out = await generateStructured(
          // temperature 0 = deterministic extraction: same content -> same facts, every instance.
          {
            model: mechModel,
            messages: p.messages,
            toolName: p.toolName,
            schema: p.schema,
            reasoningEffort: "low",
            temperature: 0,
          },
          { requestId }
        );
        perChunk.push(
          Array.isArray(out.facts) ? (out.facts as string[]).map((f) => dlpScrub(String(f))) : []
        );
      }
      const merged = mergeFacts(perChunk);
      // Stage 3.5: collapse near-duplicate quotes (reworded/reordered restatements of one point) that
      // survive mergeFacts' exact dedup, so the writer gets distinct points, not repeats. Non-lossy:
      // only near-identical facts merge, and the more complete one wins. Never a silent drop.
      const deduped = dedupeFacts(merged.facts);
      facts = deduped.facts;
      if (merged.dropped > 0)
        log.info(
          "extract",
          `${slug}: ${chunks.length} chunks, +${merged.dropped} facts dropped [${requestId}]`,
          { requestId }
        );
      if (deduped.dropped > 0)
        log.info(
          "extract",
          `${slug}: ${deduped.dropped} near-duplicate facts collapsed [${requestId}]`,
          { requestId }
        );
    }
    return {
      slug,
      component: name,
      storyArc: String(component["Hand-Off Story Arc"] ?? ""),
      facts,
    };
  };

  const writeArc = async (
    unit: WriteUnit,
    arcFacts: ComponentFactBase[]
  ): Promise<WrittenComponent[]> => {
    guardCall();
    // Write ONE story arc: a small, bounded response that cannot truncate a reasoning model's
    // output budget or overflow a provider's structured-output limit.
    const miniOutline = { ...unit.outline, sections: [unit.outline.sections[unit.arcIndex]] };
    const wp = buildWriterPrompt(unit.audience, miniOutline, arcFacts, spfStrings);
    try {
      const out = await generateStructured(
        {
          model: writerModel,
          messages: wp.messages,
          toolName: wp.toolName,
          schema: wp.schema,
          reasoningEffort: "low",
        },
        { requestId, timeoutMs: WRITER_TIMEOUT_MS, deadlineMs: WRITER_DEADLINE_MS }
      );
      return Array.isArray(out.components)
        ? (out.components as WrittenComponent[]).map((c) => ({
            slug: String(c.slug),
            markdown: dlpScrub(String(c.markdown ?? "")),
          }))
        : [];
    } catch (e) {
      // The port already retried within its deadline; a failure here (terminal or exhausted) degrades
      // THIS arc to the renderer's honest "Awaiting content." placeholder rather than failing the run.
      log.warn(
        "write",
        `${unit.audience}: arc "${unit.outline.sections[unit.arcIndex].arc}" degraded [${requestId}]: ${e instanceof Error ? e.message : String(e)}`,
        { requestId }
      );
      return [];
    }
  };

  const finalize = async (unit: FinalizeUnit, written: WrittenComponent[]): Promise<void> => {
    const meta = {
      phase: ctx.phase,
      milestones,
      generatedLabel: `Generated from the Skills and Practices Framework (${ctx.spfVersion}).`,
    };
    const md = renderVersionMarkdown(unit.outline, written, meta, linkMap);
    const html = renderVersionHtml(unit.outline, written, meta, linkMap);
    // Idempotent store: upsert the blobs + the file rows (unique on production_id,audience,format),
    // so re-finalizing after a resume overwrites rather than duplicates.
    for (const [fmt, body, ctype] of [
      ["md", md, "text/markdown"],
      ["html", html, "text/html"],
    ] as const) {
      const path = `${ctx.projectId}/${ctx.phase}/${ctx.runId}/${unit.audience}.${fmt}`;
      const bytes = new TextEncoder().encode(body);
      const up = await svc.storage
        .from("handoff-outputs")
        .upload(path, bytes, { contentType: ctype, upsert: true });
      if (up.error) throw up.error;
      const row = await svc
        .from("handoff_output_files")
        .upsert(
          {
            production_id: ctx.runId,
            audience: unit.audience,
            format: fmt,
            storage_path: path,
            checksum: await sha256Hex(body),
            bytes: bytes.length,
          },
          { onConflict: "production_id,audience,format" }
        );
      if (row.error) throw row.error;
    }
    log.info("write", `${unit.audience} md+html stored [${ctx.requestId}]`, {
      requestId: ctx.requestId,
    });
  };

  return { extractFacts, writeArc, finalize };
}

/**
 * Drive a run (from `initial` state, or a fresh run) toward completion, calling `hooks` between
 * units for the caller's budget + checkpoint control. This is the shared core used by both the
 * run-to-completion path (processRun) and the durable worker.
 */
export async function runHandoff(
  svc: SvcClient,
  ctx: RunContext,
  hooks: { shouldContinue: () => boolean; checkpoint: (s: PipelineState) => Promise<boolean> },
  initial?: PipelineState
): Promise<{ state: PipelineState; stopped: DriveStop }> {
  let llmCalls = 0;
  const guardCall = () => {
    if (++llmCalls > MAX_LLM_CALLS) throw new Error(`LLM call cap (${MAX_LLM_CALLS}) exceeded`);
  };
  const loaded = await loadRunContext(svc, ctx.projectId, ctx.phase);
  const plan = buildRunPlan(loaded.components);
  const eff = buildEffects(svc, ctx, loaded, guardCall);
  return driveRun(initial ?? initialState(), plan, eff, hooks);
}

/**
 * Run a hand-off to completion in one call (no budget, no external checkpoint). Used by tests and
 * any synchronous driver. The durable worker uses runHandoff with real budget + checkpoint hooks.
 */
export async function processRun(svc: SvcClient, ctx: RunContext): Promise<void> {
  const { runId, projectId, phase, requestId } = ctx;
  const setStatus = (status: string, error?: string) =>
    svc
      .from("handoff_productions")
      .update({ status, updated_at: new Date().toISOString(), ...(error ? { error } : {}) })
      .eq("id", runId);
  try {
    await setStatus("extracting");
    const { stopped } = await runHandoff(svc, ctx, {
      shouldContinue: () => true,
      checkpoint: () => Promise.resolve(true),
    });
    if (stopped !== "done") throw new Error(`run did not complete: ${stopped}`);
    await svc
      .from("handoff_productions")
      .update({ is_latest: false })
      .eq("project_id", projectId)
      .eq("phase", phase)
      .neq("id", runId);
    await setStatus("complete");
    log.info("run", `hand-off complete [${requestId}] run=${runId}`, { requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("run", `hand-off failed [${requestId}]: ${msg}`, { requestId });
    await setStatus("failed", msg.slice(0, 500));
  }
}

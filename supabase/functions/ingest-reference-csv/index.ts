// Admin-only loader: parses a CSV and upserts rows into a reference_* table.
// Mirrors auth pattern from ingest-csv-knowledge.
//
// Lossless ingest contract (audit 2026-05-03):
//   • Every CSV column lands in the row — name/description/category in their
//     dedicated columns, all other columns retained verbatim under `data`
//     (JSONB) keyed by the original CSV header.
//   • Columns ending in " copy" are KEPT (Airtable provenance preserved).
//   • Cells containing Airtable attachment URLs are KEPT verbatim.
//   • Per-cell cap raised from 8 KB → 64 KB. If exceeded, value is suffixed
//     with `…[truncated <N> chars]` so the loss is visible, never silent.
//   • Multi-value cells are case-insensitively deduplicated via splitDedupe
//     before storage.
//   • For every recognized relationship column, edges are emitted into
//     framework_edges via fw_emit_edges_for_entity. Unresolved name lookups
//     land in framework_edge_staging — never silently dropped.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map dataset_name (matches AdminIngestPage labels) -> reference table +
// category default + entity_type used by the framework graph.
const DATASET_TO_TABLE: Record<string, { table: string; entity: string; category?: string }> = {
  "Skills": { table: "reference_skills", entity: "skill" },
  "Skills Framework Data Types": { table: "reference_skills", entity: "skill", category: "Framework" },
  "Practices": { table: "reference_practices", entity: "practice" },
  "Activities": { table: "reference_activities", entity: "activity" },
  "Duties": { table: "reference_duties", entity: "duty" },
  "Deliverables": { table: "reference_deliverables", entity: "deliverable" },
  "Deliverables (Extended)": { table: "reference_deliverables", entity: "deliverable" },
  "Workshops (Detailed)": { table: "reference_workshops", entity: "workshop" },
  "Agile Methods": { table: "reference_agile_methods", entity: "agile_method" },
  "Milestones": { table: "reference_project_milestones", entity: "milestone" },
  "Job Functions": { table: "reference_job_functions", entity: "job_function" },
  // Legacy alias kept so old client invocations don't 400 — routed to the
  // renamed table. New callers must use "Job Functions".
  "Team Functions": { table: "reference_job_functions", entity: "job_function" },
  "Tools": { table: "reference_tools", entity: "tool" },
  "Tech Job Categories": { table: "reference_tech_job_categories", entity: "tech_job_category" },
  "Job Industries": { table: "reference_job_industries", entity: "job_industry" },
  "Job Specializations": { table: "reference_job_specializations", entity: "specialization" },
  "Company Types": { table: "reference_company_types", entity: "company_type" },
  "Stakeholders": { table: "reference_stakeholders", entity: "stakeholder" },
};

/**
 * Terminology rename map applied at ingest time so legacy CSV headers
 * land under the new vocabulary in `data` JSONB.
 */
const HEADER_RENAMES: Array<[RegExp, string]> = [
  [/\bRoles?\b/g,           "Duties"],
  [/\bHard Skills?\b/g,     "Technical and Interpersonal Skills"],
  [/\bSoft Skills?\b/g,     "Team Practices"],
  [/\bTeam Functions?\b/g,  "Job Functions"],
];

function renameHeader(h: string): string {
  let out = h;
  for (const [re, repl] of HEADER_RENAMES) out = out.replace(re, repl);
  return out;
}

/**
 * Map of canonical (renamed) column header → framework relationship type.
 * Only headers listed here become edges; everything else still lands in
 * `data` JSONB so no information is lost.
 */
const REL_MAP: Record<string, { rel: string; dst: string }> = {
  "Duties":                              { rel: "performed_by",         dst: "duty" },
  "Job Functions":                       { rel: "owned_by",             dst: "job_function" },
  "Technical and Interpersonal Skills":  { rel: "teaches_skill",        dst: "skill" },
  "Team Practices":                      { rel: "uses_practice",        dst: "practice" },
  "Tools":                               { rel: "uses_tool",            dst: "tool" },
  "Stakeholders":                        { rel: "engages_stakeholder",  dst: "stakeholder" },
  "Deliverables":                        { rel: "produces",             dst: "deliverable" },
  "Activities":                          { rel: "part_of",              dst: "activity" },
  "Milestones":                          { rel: "part_of",              dst: "milestone" },
  "Company Types":                       { rel: "targets_company_type", dst: "company_type" },
  "Job Industries":                      { rel: "related_to",           dst: "job_industry" },
  "Job Specializations":                 { rel: "related_to",           dst: "specialization" },
  "Tech Job Categories":                 { rel: "related_to",           dst: "tech_job_category" },
  "Agile Methods":                       { rel: "applies_method",       dst: "agile_method" },
  "Handbooks":                           { rel: "references",           dst: "handbook" },
  "Workshops":                           { rel: "references",           dst: "workshop" },
  // Company-Types-specific: required vs excluded deliverables
  "Required Deliverables":               { rel: "produces",             dst: "deliverable" },
  "Excluded Deliverables":               { rel: "excludes",             dst: "deliverable" },
};

/** Per-cell hard cap. Anything over this is truncated with a visible marker. */
const CELL_CAP = 64 * 1024;

// Robust CSV parser supporting quoted fields with commas/newlines/quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ""));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

function pickCol(headers: string[], candidates: string[]): number {
  const lc = headers.map(h => h.trim().toLowerCase().replace(/^\ufeff/, ""));
  for (const cand of candidates) {
    const idx = lc.indexOf(cand.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Quote-aware split → trim → case-insensitive dedup → sort.
 * Returns [] for empty / whitespace-only inputs.
 * First-occurrence-wins preserves the original casing the curator chose.
 */
function splitDedupe(value: string): string[] {
  if (!value) return [];
  // Quote-aware comma split
  const parts: string[] = [];
  let buf = "";
  let q = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') {
      if (q && value[i + 1] === '"') { buf += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) {
      parts.push(buf); buf = "";
    } else if ((ch === '\n' || ch === ';') && !q) {
      parts.push(buf); buf = "";
    } else {
      buf += ch;
    }
  }
  parts.push(buf);

  const seen = new Map<string, string>(); // lowercased -> originalCasing
  for (const raw of parts) {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Cap a cell value; append a visible truncation marker if it overflows. */
function capCell(val: string): string {
  if (val.length <= CELL_CAP) return val;
  const removed = val.length - CELL_CAP;
  return val.slice(0, CELL_CAP) + ` …[truncated ${removed} chars]`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: JWT + admin role, OR service-role bearer (for trusted server-side ingest)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = authHeader.slice("Bearer ".length).trim();
  const isServiceRole = token === SERVICE;

  if (!isServiceRole) {
    const anonClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const adminCheck = createClient(SUPABASE_URL, SERVICE);
    const { data: roleRow } = await adminCheck
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
  const admin = createClient(SUPABASE_URL, SERVICE);

  try {
    const body = await req.json();
    const { csv_text, dataset_name } = body as { csv_text: string; dataset_name: string };

    if (!csv_text || !dataset_name) {
      return new Response(JSON.stringify({ error: "csv_text and dataset_name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cfg = DATASET_TO_TABLE[dataset_name];
    if (!cfg) {
      return new Response(JSON.stringify({ error: `Unknown dataset: ${dataset_name}`, hint: Object.keys(DATASET_TO_TABLE) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rows = parseCsv(csv_text);
    if (rows.length < 2) {
      return new Response(JSON.stringify({ table: cfg.table, parsed: 0, upserted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apply terminology rename to headers up-front so JSONB keys + REL_MAP
    // lookups match the new vocabulary.
    const rawHeaders = rows[0].map(h => h.replace(/^\ufeff/, "").trim());
    const headers = rawHeaders.map(renameHeader);

    const nameIdx = 0;
    const descIdx = pickCol(headers, [
      `${headers[0]} Description`, "Description", "Specialization Description", "Skill Description",
      "Practice Description", "Activity Description", "Tool Description",
      "Method Splash Image", "Basic Definition of the Method", "Commitment Description",
      "Workshop Description", "Description of the Workshop", "Milestone Description",
      "Job Industry Description", "Category Description (from Tech Job Category)",
      "Stakeholder Description", "Company Type Description",
    ]);
    const catIdx = pickCol(headers, [
      "Category", "Workshop Category", "Tech Job Category", "Tech Career Category",
      "Data Type", "Skill Type",
    ]);

    type Upsert = Record<string, unknown> & { slug: string; data: Record<string, unknown> };
    const upserts: Upsert[] = [];
    const seen = new Set<string>();
    let attachmentsKept = 0;
    let truncatedCells = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawName = (row[nameIdx] || "").trim();
      if (!rawName) continue;
      const slug = slugify(rawName);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const description = descIdx >= 0 ? capCell((row[descIdx] || "").trim()) : "";
      const category = (catIdx >= 0 ? (row[catIdx] || "").trim() : "") || cfg.category || "";

      const data: Record<string, unknown> = {};
      for (let c = 0; c < headers.length && c < row.length; c++) {
        if (c === nameIdx || c === descIdx || c === catIdx) continue;
        const key = headers[c];
        if (!key) continue;
        const rawVal = (row[c] || "").trim();
        if (!rawVal) continue;

        const isAttachment = rawVal.includes("airtableusercontent.com");
        if (isAttachment) attachmentsKept++;

        const before = rawVal.length;
        const capped = capCell(rawVal);
        if (capped.length !== before) truncatedCells++;

        if (REL_MAP[key]) {
          // Multi-value relationship column → store as deduplicated array.
          const arr = splitDedupe(capped);
          if (arr.length > 0) data[key] = arr;
        } else if (/[,;\n]/.test(capped) && !isAttachment) {
          // Generic multi-value column → still dedupe but keep both array and
          // joined form for backward-compat readability.
          const arr = splitDedupe(capped);
          data[key] = arr.length > 1 ? arr : capped;
        } else {
          data[key] = capped;
        }
      }

      upserts.push({
        slug,
        name: rawName.slice(0, 500),
        description,
        category: category.slice(0, 200),
        data,
        source: "csv",
        source_row_id: `${dataset_name}#${r}`,
        is_active: true,
      });
    }

    // Batch upsert (chunks of 200)
    let upserted = 0;
    for (let i = 0; i < upserts.length; i += 200) {
      const chunk = upserts.slice(i, i + 200);
      const { error } = await admin.from(cfg.table).upsert(chunk, { onConflict: "slug" });
      if (error) {
        return new Response(JSON.stringify({ error: error.message, table: cfg.table, batch_start: i }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      upserted += chunk.length;
    }

    // ── Edge emission ────────────────────────────────────────────────
    // Pull back the upserted rows so we have ids, then ask the DB to
    // resolve every relationship column into framework_edges. Anything
    // that can't be resolved lands in framework_edge_staging.
    let edgesEmitted = 0;
    let edgesStaged = 0;
    const slugs = upserts.map(u => u.slug);
    if (slugs.length > 0) {
      const { data: inserted } = await admin
        .from(cfg.table)
        .select("id, slug, data")
        .in("slug", slugs);

      for (const row of inserted ?? []) {
        const { data: result, error: edgeErr } = await admin.rpc("fw_emit_edges_for_entity", {
          p_src_type: cfg.entity,
          p_src_id: (row as { id: string }).id,
          p_data: (row as { data: unknown }).data ?? {},
          p_source: `csv:${dataset_name}`,
        });
        if (edgeErr) {
          // Don't fail the whole ingest — log and continue.
          console.warn(`[ingest] edge emit failed for ${cfg.table}/${(row as { slug: string }).slug}: ${edgeErr.message}`);
          continue;
        }
        if (result && typeof result === "object") {
          edgesEmitted += Number((result as { inserted?: number }).inserted ?? 0);
          edgesStaged  += Number((result as { staged?: number }).staged ?? 0);
        }
      }
    }

    // Refresh the neighbors materialized view so Fleety sees the new graph
    // immediately. This is debounced inside the function.
    try { await admin.rpc("fw_refresh_neighbors_mv"); } catch { /* non-fatal */ }

    return new Response(JSON.stringify({
      table: cfg.table,
      dataset_name,
      parsed: upserts.length,
      upserted,
      attachments_kept: attachmentsKept,
      truncated_cells: truncatedCells,
      edges_inserted: edgesEmitted,
      edges_staged: edgesStaged,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

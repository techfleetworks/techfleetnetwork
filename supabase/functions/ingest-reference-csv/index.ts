// Admin-only loader: parses a CSV and upserts rows into a reference_* table.
// Mirrors auth pattern from ingest-csv-knowledge.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map dataset_name (matches AdminIngestPage labels) -> reference table + category default
const DATASET_TO_TABLE: Record<string, { table: string; category?: string }> = {
  "Skills": { table: "reference_skills" },
  "Skills Framework Data Types": { table: "reference_skills", category: "Framework" },
  "Practices": { table: "reference_practices" },
  "Activities": { table: "reference_activities" },
  "Duties": { table: "reference_duties" },
  "Deliverables": { table: "reference_deliverables" },
  "Deliverables (Extended)": { table: "reference_deliverables" },
  "Workshops (Detailed)": { table: "reference_workshops" },
  "Agile Methods": { table: "reference_agile_methods" },
  "Milestones": { table: "reference_project_milestones" },
  "Team Functions": { table: "reference_team_functions" },
  "Tools": { table: "reference_tools" },
  "Tech Job Categories": { table: "reference_tech_job_categories" },
  "Job Industries": { table: "reference_job_industries" },
  "Job Specializations": { table: "reference_job_specializations" },
  "Company Types": { table: "reference_company_types" },
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: JWT + admin role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: roleRow } = await admin
    .from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

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

    const headers = rows[0].map(h => h.replace(/^\ufeff/, "").trim());
    // Identify columns
    const nameIdx = 0; // First column is always the entity name across all CSVs
    const descIdx = pickCol(headers, [
      `${headers[0]} Description`, "Description", "Specialization Description", "Skill Description",
      "Practice Description", "Activity Description", "Tool Description",
      "Method Splash Image", "Basic Definition of the Method", "Commitment Description",
      "Workshop Description", "Description of the Workshop", "Milestone Description",
      "Job Industry Description", "Category Description (from Tech Job Category)",
    ]);
    const catIdx = pickCol(headers, [
      "Category", "Workshop Category", "Tech Job Category", "Tech Career Category",
      "Data Type", "Skill Type",
    ]);

    const upserts: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawName = (row[nameIdx] || "").trim();
      if (!rawName) continue;
      const slug = slugify(rawName);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const description = descIdx >= 0 ? (row[descIdx] || "").trim() : "";
      const category = (catIdx >= 0 ? (row[catIdx] || "").trim() : "") || cfg.category || "";

      const data: Record<string, string> = {};
      for (let c = 0; c < headers.length && c < row.length; c++) {
        if (c === nameIdx || c === descIdx || c === catIdx) continue;
        const key = headers[c];
        if (!key || key.endsWith(" copy")) continue;
        const val = (row[c] || "").trim();
        if (!val || val.includes("airtableusercontent.com")) continue;
        if (val.length > 8000) data[key] = val.slice(0, 8000); else data[key] = val;
      }

      upserts.push({
        slug,
        name: rawName.slice(0, 500),
        description: description.slice(0, 8000),
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

    return new Response(JSON.stringify({ table: cfg.table, dataset_name, parsed: upserts.length, upserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

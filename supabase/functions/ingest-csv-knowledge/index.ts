import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseCsvToMarkdown(csvText: string, datasetName: string): { url: string; title: string; content: string }[] {
  // Split into lines, handling multiline quoted fields
  const rows: string[][] = [];
  let current: string[] = [];
  let inQuotes = false;
  let field = "";

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      current.push(field.trim());
      field = "";
    } else if (ch === '\n' && !inQuotes) {
      current.push(field.trim());
      if (current.some(f => f !== "")) {
        rows.push(current);
      }
      current = [];
      field = "";
    } else if (ch === '\r' && !inQuotes) {
      // skip carriage return
    } else {
      field += ch;
    }
  }
  // Last field/row
  if (field || current.length > 0) {
    current.push(field.trim());
    if (current.some(f => f !== "")) {
      rows.push(current);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0];
  const entries: { url: string; title: string; content: string }[] = [];

  // Find the name/title column (first column)
  const nameCol = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[nameCol] || "";
    if (!name || name === "﻿") continue;

    // Build markdown content from all non-empty fields
    let md = `# ${name}\n\n`;
    md += `**Category:** ${datasetName}\n\n`;

    for (let c = 1; c < headers.length && c < row.length; c++) {
      const val = row[c];
      if (!val || val.includes("airtableusercontent.com")) continue; // Skip image URLs
      const header = headers[c] || `Field ${c}`;
      // Skip redundant copy columns
      if (header.endsWith(" copy")) continue;
      md += `## ${header}\n\n${val}\n\n`;
    }

    entries.push({
      url: `csv://${datasetName.toLowerCase().replace(/\s+/g, "-")}/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${datasetName}: ${name}`,
      content: md.trim(),
    });
  }

  return entries;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { csv_text, dataset_name } = await req.json();

    if (!csv_text || !dataset_name) {
      return new Response(
        JSON.stringify({ success: false, error: "csv_text and dataset_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const entries = parseCsvToMarkdown(csv_text, dataset_name);
    console.log(`Parsed ${entries.length} entries from ${dataset_name}`);

    let inserted = 0;
    let errors = 0;

    for (const entry of entries) {
      const { error } = await supabase.from("knowledge_base").upsert(
        {
          url: entry.url,
          title: entry.title,
          content: entry.content,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: "url" }
      );
      if (error) {
        console.error(`Error inserting ${entry.title}:`, error);
        errors++;
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, dataset_name, parsed: entries.length, inserted, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

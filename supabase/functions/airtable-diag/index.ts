import { handleCors, jsonResponse } from "../_shared/http.ts";
import { requireAdminRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { validateAirtableConfig } from "../sync-airtable/validation.ts";

/**
 * SECURITY: This endpoint exposes Airtable schema and field names. It must
 * NEVER be reachable without admin auth. Originally deployed without auth —
 * fixed 2026-04-18 audit.
 */
const log = createEdgeLogger("airtable-diag");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAdminRequest(req);
  if (auth instanceof Response) return auth;

  const PAT = Deno.env.get("AIRTABLE_PAT") ?? "";
  const BASE_ID = Deno.env.get("AIRTABLE_BASE_ID") ?? "";
  const TABLE_NAME = validateAirtableConfig(BASE_ID, Deno.env.get("AIRTABLE_TABLE_NAME"));
  const results: Record<string, unknown> = {};

  if (!PAT || TABLE_NAME instanceof Response) return jsonResponse({ error: "Airtable credentials not configured" }, 500);

  try {
    const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    const body = await r.text();
    results.schema_status = r.status;
    if (r.ok) {
      const parsed = JSON.parse(body);
      results.table_names = parsed.tables?.map((t: { name: string }) => ({
        name: t.name,
      }));
    } else {
      results.schema_error = "Airtable schema check failed";
    }
  } catch (e) {
    log.warn("schema_check_failed", "Airtable schema diagnostic failed", undefined, e);
    results.schema_error = "Airtable schema check failed";
  }

  try {
    const table = encodeURIComponent(TABLE_NAME);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${table}?maxRecords=1`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` } });
    if (r.ok) {
      const body = await r.json();
      const fields = body.records?.[0]?.fields ?? {};
      results.sample_field_names = Object.keys(fields);
    } else {
      results.sample_status = r.status;
    }
  } catch (e) {
    log.warn("sample_check_failed", "Airtable sample diagnostic failed", undefined, e);
    results.sample_error = "Airtable sample check failed";
  }

  return jsonResponse(results);
});

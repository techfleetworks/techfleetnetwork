import { getAdminClient } from "../_shared/admin-client.ts";
import { handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { requireAdminRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("sync-airtable-roster");
const DEFAULT_TABLE_NAME = "Project Roster";
const AIRTABLE_TABLE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s_\-()&./]{0,79}$/u;

/**
 * Fetches all records from a given Airtable table using pagination.
 * Returns an array of Airtable record objects.
 */
async function fetchAllAirtableRecords(
  baseId: string,
  tableName: string,
  pat: string,
): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  const encodedTable = encodeURIComponent(tableName);

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodedTable}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!res.ok) {
      throw new Error(`Airtable fetch failed with status ${res.status}`);
    }

    const data = await res.json();
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return records;
}

function parseTableName(input: unknown): string {
  if (input == null || input === "") return DEFAULT_TABLE_NAME;
  if (typeof input !== "string") throw jsonResponse({ error: "Invalid table name" }, 400);
  const tableName = input.trim().replace(/\s+/g, " ");
  if (!AIRTABLE_TABLE_NAME_PATTERN.test(tableName)) {
    throw jsonResponse({ error: "Invalid table name" }, 400);
  }
  return tableName;
}

/**
 * Maps an Airtable record's fields to the project_roster row shape.
 * Field names are case-insensitive matched for resilience.
 */
function mapToRosterRow(
  airtableId: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  // Build a lowercase lookup for field names
  const lc: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    lc[k.toLowerCase().replace(/[\s_-]+/g, "_")] = v;
  }

  const getString = (...keys: string[]): string => {
    for (const k of keys) {
      const val = lc[k];
      if (typeof val === "string" && val.trim()) return val.trim();
      if (Array.isArray(val) && val.length) return val.join(", ");
    }
    return "";
  };

  const getNumber = (...keys: string[]): number => {
    for (const k of keys) {
      const val = lc[k];
      if (typeof val === "number") return val;
      if (typeof val === "string") {
        const n = parseFloat(val);
        if (!isNaN(n)) return n;
      }
    }
    return 0;
  };

  const getDate = (...keys: string[]): string | null => {
    for (const k of keys) {
      const val = lc[k];
      if (typeof val === "string" && val.trim()) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      }
    }
    return null;
  };

  const getArray = (...keys: string[]): string[] => {
    for (const k of keys) {
      const val = lc[k];
      if (Array.isArray(val)) return val.map(String);
    }
    return [];
  };

  return {
    airtable_record_id: airtableId,
    member_name: getString("member_name", "name", "team_member", "member", "full_name"),
    member_email: getString("member_email", "email", "email_address"),
    member_role: getString("member_role", "role", "hat", "team_hat", "position"),
    project_name: getString("project_name", "project", "project_title"),
    client_name: getString("client_name", "client", "organization"),
    phase: getString("phase", "project_phase"),
    project_type: getString("project_type", "type"),
    status: getString("status", "member_status", "assignment_status"),
    start_date: getDate("start_date", "start", "date_started", "assigned_date"),
    end_date: getDate("end_date", "end", "date_ended", "completion_date"),
    hours_contributed: getNumber("hours_contributed", "hours", "total_hours"),
    performance_notes: getString("performance_notes", "notes", "feedback", "performance"),
    mentor: getString("mentor", "mentor_name", "assigned_mentor"),
    linked_project_ids: getArray("linked_project_ids", "linked_projects", "project_links"),
    raw_airtable_data: fields,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAdminRequest(req);
    if (auth instanceof Response) return auth;
    const supabaseAdmin = getAdminClient();

    // --- Env ---
    const AIRTABLE_PAT = Deno.env.get("AIRTABLE_PAT");
    if (!AIRTABLE_PAT) throw new Error("AIRTABLE_PAT is not configured");

    const AIRTABLE_BASE_ID = Deno.env.get("AIRTABLE_BASE_ID");
    if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is not configured");

    const body = await parseJsonBody(req, 1024).catch((error) => {
      if (error instanceof Response && error.status === 415) return {};
      throw error;
    }) as Record<string, unknown>;
    const tableName = parseTableName(body.table_name);

    // --- Fetch all records from Airtable ---
    log.info("airtable_fetch_start", "Fetching Airtable roster records", { tableName });
    const records = await fetchAllAirtableRecords(AIRTABLE_BASE_ID, tableName, AIRTABLE_PAT);
    log.info("airtable_fetch_complete", "Fetched Airtable roster records", { tableName, recordCount: records.length });

    if (records.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, created: 0, updated: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Upsert into project_roster ---
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const rows = batch.map((r) => mapToRosterRow(r.id, r.fields));

      const { data: upserted, error: upsertErr } = await supabaseAdmin
        .from("project_roster")
        .upsert(rows, { onConflict: "airtable_record_id", ignoreDuplicates: false })
        .select("id");

      if (upsertErr) {
        log.error("roster_upsert_batch", "Roster batch upsert failed", { batchStart: i }, upsertErr);
        errors.push(`Batch ${i}: ${upsertErr.message}`);
      } else {
        // Count created vs updated (simplified — upsert doesn't distinguish)
        created += upserted?.length ?? 0;
      }
    }

    // Log the sync event
    await supabaseAdmin.from("audit_log").insert({
      event_type: "roster_sync_completed",
      table_name: "project_roster",
      record_id: "bulk",
      user_id: auth.userId,
      changed_fields: [`synced:${records.length}`, `errors:${errors.length}`],
    });

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        synced: records.length,
        upserted: created,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("sync_failed", "Roster sync failed", undefined, error);
    return jsonResponse({ success: false, error: "Roster sync failed. Please try again or check System Health." }, 500);
  }
});

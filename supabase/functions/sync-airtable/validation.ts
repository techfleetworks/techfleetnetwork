import { jsonResponse } from "../_shared/http.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AIRTABLE_BASE_ID_PATTERN = /^app[A-Za-z0-9]{14}$/;
const AIRTABLE_TABLE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s_\-()&./]{0,79}$/u;

export interface SyncAirtableRequest {
  application_id: string;
}

export function parseSyncAirtableRequest(body: unknown): SyncAirtableRequest | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const applicationId = (body as Record<string, unknown>).application_id;
  if (typeof applicationId !== "string" || !UUID_PATTERN.test(applicationId.trim())) {
    return jsonResponse({ error: "Invalid application_id" }, 400);
  }

  return { application_id: applicationId.trim() };
}

export function validateAirtableConfig(baseId: string | undefined, tableName: string | undefined): string | Response {
  if (!baseId || !AIRTABLE_BASE_ID_PATTERN.test(baseId)) {
    return jsonResponse({ error: "Airtable base is not configured" }, 500);
  }

  const normalizedTableName = tableName?.trim().replace(/\s+/g, " ");
  if (!normalizedTableName || !AIRTABLE_TABLE_NAME_PATTERN.test(normalizedTableName)) {
    return jsonResponse({ error: "Airtable table is not configured" }, 500);
  }

  return normalizedTableName;
}
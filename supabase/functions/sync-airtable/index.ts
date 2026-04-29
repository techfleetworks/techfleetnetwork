import { handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { parseSyncAirtableRequest, validateAirtableConfig } from "../_shared/airtable-validation.ts";

const log = createEdgeLogger("sync-airtable");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) return auth;

    const AIRTABLE_PAT = Deno.env.get("AIRTABLE_PAT");
    if (!AIRTABLE_PAT) return jsonResponse({ error: "Airtable sync is not configured" }, 500);

    const AIRTABLE_BASE_ID = Deno.env.get("AIRTABLE_BASE_ID");
    const tableName = validateAirtableConfig(AIRTABLE_BASE_ID, Deno.env.get("AIRTABLE_TABLE_NAME"));
    if (tableName instanceof Response) return tableName;

    const parsed = parseSyncAirtableRequest(await parseJsonBody(req, 1024));
    if (parsed instanceof Response) return parsed;

    const { data: app, error: appError } = await auth.userClient
      .from("general_applications")
      .select("id,email,title,about_yourself,status,created_at,updated_at")
      .eq("id", parsed.application_id)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (appError) {
      log.error("application_lookup_failed", "Unable to load general application for Airtable sync", { applicationId: parsed.application_id }, appError);
      return jsonResponse({ success: false, error: "Unable to sync application" }, 500);
    }
    if (!app) {
      return jsonResponse({ success: false, error: "Application not found" }, 404);
    }

    const encodedTable = encodeURIComponent(tableName);
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTable}`;

    const fields = {
      application_id: app.id,
      user_id: auth.userId,
      user_email: app.email ?? "",
      title: app.title ?? "General Application",
      about_yourself: app.about_yourself ?? "",
      status: app.status ?? "draft",
      created_at: app.created_at ?? new Date().toISOString(),
      updated_at: app.updated_at ?? new Date().toISOString(),
    };

    const airtableRes = await fetch(airtableUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ["application_id"] },
        records: [{ fields }],
      }),
    });

    if (!airtableRes.ok) {
      await airtableRes.text();
      log.error("airtable_upsert_failed", "Airtable upsert failed", { status: airtableRes.status, applicationId: app.id });
      return jsonResponse({ success: false, error: "Airtable sync failed" }, 200);
    }

    const result = await airtableRes.json();
    const firstRecord = result.records?.[0];

    return jsonResponse({ success: true, airtable_id: firstRecord?.id ?? null });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("sync_failed", "General application Airtable sync failed", undefined, error);
    return jsonResponse({ success: false, error: "Airtable sync failed" }, 500);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims.email as string) ?? "";

    if (!userEmail) {
      return new Response(JSON.stringify({ error: "No email associated with account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Env ---
    const AIRTABLE_PAT = Deno.env.get("AIRTABLE_PAT");
    if (!AIRTABLE_PAT) throw new Error("AIRTABLE_PAT is not configured");

    const AIRTABLE_BASE_ID = Deno.env.get("AIRTABLE_BASE_ID");
    if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is not configured");

    const TABLE_NAME = "Masterclass Registeration";

    // --- Admin client for DB writes ---
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- Query Airtable by email ---
    const encodedTable = encodeURIComponent(TABLE_NAME);
    const filterFormula = encodeURIComponent(`{Contributor Email Address (from Contributor Record)} = "${userEmail}"`);
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTable}?filterByFormula=${filterFormula}&pageSize=100`;

    const airtableRes = await fetch(airtableUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
      },
    });

    if (!airtableRes.ok) {
      const errBody = await airtableRes.text();
      console.error("fetch-class-certifications Airtable query failed", {
        status: airtableRes.status,
        response: errBody,
      });

      // Log to audit_log so admins can see it in Activity Log
      await adminClient.rpc("write_audit_log", {
        p_event_type: "client_error",
        p_table_name: "class_certifications",
        p_record_id: userId,
        p_user_id: userId,
        p_changed_fields: ["fetch-class-certifications", `Airtable ${airtableRes.status}`],
        p_error_message: `Airtable query failed [${airtableRes.status}]: ${errBody.slice(0, 500)}`,
      });

      return new Response(JSON.stringify({
        success: false,
        error: `Airtable query failed [${airtableRes.status}]. Please ensure your Airtable token has access to the Masterclass Registration table.`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await airtableRes.json();
    const records = result.records ?? [];

    // --- Resolve linked "Registered For" IDs to Cohort Names ---
    const cohortIds = new Set<string>();
    for (const record of records) {
      const regFor = record.fields?.["Registered For"];
      if (Array.isArray(regFor)) {
        regFor.forEach((id: string) => cohortIds.add(id));
      }
    }

    const cohortNameMap: Record<string, string> = {};
    if (cohortIds.size > 0) {
      // Airtable allows fetching specific records by ID via filterByFormula OR via GET record
      // Batch lookup using RECORD_ID() formula
      const cohortTable = encodeURIComponent("Masterclass Cohorts");
      const idArray = Array.from(cohortIds);

      // Fetch in batches of 50 to avoid URL length limits
      for (let i = 0; i < idArray.length; i += 50) {
        const batch = idArray.slice(i, i + 50);
        const orClauses = batch.map((id) => `RECORD_ID()='${id}'`).join(",");
        const formula = encodeURIComponent(`OR(${orClauses})`);
        const cohortUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${cohortTable}?filterByFormula=${formula}&fields%5B%5D=${encodeURIComponent("Cohort Name")}`;

        const cohortRes = await fetch(cohortUrl, {
          headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
        });

        if (cohortRes.ok) {
          const cohortData = await cohortRes.json();
          for (const rec of cohortData.records ?? []) {
            const name = rec.fields?.["Cohort Name"];
            if (name) cohortNameMap[rec.id] = String(name);
          }
        } else {
          console.error("Cohort lookup failed", cohortRes.status, await cohortRes.text());
        }
      }
    }

    // --- Upsert into DB with resolved cohort names ---

    let upserted = 0;
    for (const record of records) {
      const fields = { ...(record.fields ?? {}) };

      // Replace "Registered For" record IDs with human-readable cohort names
      const regFor = fields["Registered For"];
      if (Array.isArray(regFor)) {
        fields["Registered For"] = regFor.map((id: string) => cohortNameMap[id] || id);
      }

      const { error: upsertErr } = await adminClient
        .from("class_certifications")
        .upsert(
          {
            user_id: userId,
            email: userEmail,
            airtable_record_id: record.id,
            raw_data: fields,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "user_id,airtable_record_id" }
        );

      if (upsertErr) {
        console.error("Upsert error for record", record.id, upsertErr);
      } else {
        upserted++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_found: records.length,
      upserted,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("fetch-class-certifications error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

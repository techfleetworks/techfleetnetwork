import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims.email as string) ?? "";

    // --- Env ---
    const AIRTABLE_PAT = Deno.env.get("AIRTABLE_PAT");
    if (!AIRTABLE_PAT) throw new Error("AIRTABLE_PAT is not configured");

    const AIRTABLE_BASE_ID = Deno.env.get("AIRTABLE_BASE_ID");
    if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is not configured");

    const AIRTABLE_TABLE_NAME = Deno.env.get("AIRTABLE_TABLE_NAME");
    if (!AIRTABLE_TABLE_NAME) throw new Error("AIRTABLE_TABLE_NAME is not configured");

    // --- Body ---
    const body = await req.json();
    const { application_id, title, about_yourself, status, created_at, updated_at } = body;

    if (!application_id || typeof application_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing application_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Airtable upsert ---
    // Use Airtable's native upsert support so sync only requires one write request.
    const encodedTable = encodeURIComponent(AIRTABLE_TABLE_NAME);
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTable}`;

    const fields = {
      application_id,
      user_id: userId,
      user_email: userEmail,
      title: title ?? "General Application",
      about_yourself: about_yourself ?? "",
      status: status ?? "draft",
      created_at: created_at ?? new Date().toISOString(),
      updated_at: updated_at ?? new Date().toISOString(),
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
      const errBody = await airtableRes.text();
      console.error("sync-airtable Airtable upsert failed", {
        status: airtableRes.status,
        baseId: AIRTABLE_BASE_ID,
        tableName: AIRTABLE_TABLE_NAME,
        patLength: AIRTABLE_PAT.length,
        response: errBody,
      });

      return new Response(JSON.stringify({
        success: false,
        error: `Airtable upsert failed [${airtableRes.status}]: ${errBody}`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await airtableRes.json();
    const firstRecord = result.records?.[0];

    return new Response(JSON.stringify({ success: true, airtable_id: firstRecord?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("sync-airtable error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

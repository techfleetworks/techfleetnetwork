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

    // --- Check if record exists in Airtable (filter by application_id field) ---
    const encodedTable = encodeURIComponent(AIRTABLE_TABLE_NAME);
    const filterFormula = encodeURIComponent(`{application_id}="${application_id}"`);
    const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTable}?filterByFormula=${filterFormula}&maxRecords=1`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    });

    if (!searchRes.ok) {
      const errBody = await searchRes.text();
      throw new Error(`Airtable search failed [${searchRes.status}]: ${errBody}`);
    }

    const searchData = await searchRes.json();
    const existingRecord = searchData.records?.[0];

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

    let airtableRes: Response;

    if (existingRecord) {
      // Update existing record
      airtableRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTable}/${existingRecord.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${AIRTABLE_PAT}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields }),
        }
      );
    } else {
      // Create new record
      airtableRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTable}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AIRTABLE_PAT}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields }),
        }
      );
    }

    if (!airtableRes.ok) {
      const errBody = await airtableRes.text();
      throw new Error(`Airtable upsert failed [${airtableRes.status}]: ${errBody}`);
    }

    const result = await airtableRes.json();

    return new Response(JSON.stringify({ success: true, airtable_id: result.id }), {
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

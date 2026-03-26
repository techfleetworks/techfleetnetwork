const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const PAT = Deno.env.get("AIRTABLE_PAT") ?? "";
  const BASE_ID = Deno.env.get("AIRTABLE_BASE_ID") ?? "";
  const results: Record<string, unknown> = {
    pat_prefix: PAT.slice(0, 10) + "...",
    pat_length: PAT.length,
    base_id: BASE_ID,
  };

  // Test 1: list bases (requires schema.bases:read)
  try {
    const r = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    const body = await r.text();
    results.list_bases_status = r.status;
    results.list_bases_body = body.slice(0, 800);
  } catch (e) {
    results.list_bases_error = String(e);
  }

  // Test 2: query Masterclass Registration table directly
  try {
    const table = encodeURIComponent("Masterclass Registration");
    const url = `https://api.airtable.com/v0/${BASE_ID}/${table}?maxRecords=1`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    const body = await r.text();
    results.query_table_status = r.status;
    results.query_table_body = body.slice(0, 800);
  } catch (e) {
    results.query_table_error = String(e);
  }

  // Test 3: query General Applications table (known working)
  try {
    const table = encodeURIComponent("General Applications");
    const url = `https://api.airtable.com/v0/${BASE_ID}/${table}?maxRecords=1`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    const body = await r.text();
    results.query_general_apps_status = r.status;
    results.query_general_apps_body = body.slice(0, 300);
  } catch (e) {
    results.query_general_apps_error = String(e);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const PAT = Deno.env.get("AIRTABLE_PAT") ?? "";
  const BASE_ID = Deno.env.get("AIRTABLE_BASE_ID") ?? "";
  const results: Record<string, unknown> = {};

  // Try to list tables in the base via schema API
  try {
    const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    const body = await r.text();
    results.schema_status = r.status;
    if (r.ok) {
      const parsed = JSON.parse(body);
      results.table_names = parsed.tables?.map((t: { name: string; id: string }) => ({ name: t.name, id: t.id }));
    } else {
      results.schema_body = body.slice(0, 500);
    }
  } catch (e) {
    results.schema_error = String(e);
  }

  // Fetch one record from Masterclass Registeration to see field names
  try {
    const table = encodeURIComponent("Masterclass Registeration");
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
    results.sample_error = String(e);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

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

  // Also try common variations of the table name
  const variations = [
    "Masterclass Registration",
    "Masterclass Registrations",
    "masterclass registration",
    "Class Registration",
    "Class Registrations",
  ];

  for (const name of variations) {
    try {
      const table = encodeURIComponent(name);
      const url = `https://api.airtable.com/v0/${BASE_ID}/${table}?maxRecords=1`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` } });
      results[`try_${name}`] = r.status;
      if (r.ok) {
        const body = await r.text();
        results[`try_${name}_preview`] = body.slice(0, 200);
      }
    } catch (_) {}
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

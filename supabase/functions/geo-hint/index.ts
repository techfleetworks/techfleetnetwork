// @ts-nocheck
/**
 * geo-hint — returns the visitor's country code from the Cloudflare CF-IPCountry
 * header (no PII stored). Used by the cookie banner to choose opt-in vs opt-out
 * defaults. Public endpoint by design.
 */
import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const country =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("x-country-code") ||
    null;
  return new Response(JSON.stringify({ country }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=300",
    },
  });
});

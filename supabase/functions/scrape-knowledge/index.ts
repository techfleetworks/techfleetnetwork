import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offset = 0, limit = 10, target_url = "https://guide.techfleet.org" } = await req.json().catch(() => ({}));

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Map the site to discover all URLs
    console.log(`Mapping ${target_url}...`);
    const mapRes = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: target_url,
        limit: 500,
        includeSubdomains: false,
      }),
    });

    const mapData = await mapRes.json();
    if (!mapRes.ok) {
      console.error("Map error:", mapData);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to map site", details: mapData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const urls: string[] = mapData.links || [];
    console.log(`Found ${urls.length} URLs. Processing offset=${offset}, limit=${limit}`);

    // Slice to the requested batch
    const batch = urls.slice(offset, offset + limit);
    console.log(`Processing batch: ${batch.length} URLs (offset ${offset})`);

    // Step 2: Scrape each URL in the batch

    let scraped = 0;
    let errors = 0;

    for (const url of batch) {
      try {
        console.log(`Scraping: ${url}`);
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });

        const scrapeData = await scrapeRes.json();
        if (!scrapeRes.ok) {
          console.error(`Scrape error for ${url}:`, scrapeData);
          errors++;
          continue;
        }

        const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        const title = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || url;

        if (!markdown.trim()) {
          console.log(`Skipping empty content: ${url}`);
          continue;
        }

        // Upsert into knowledge_base
        const { error: dbError } = await supabase
          .from("knowledge_base")
          .upsert(
            {
              url,
              title,
              content: markdown,
              scraped_at: new Date().toISOString(),
            },
            { onConflict: "url" }
          );

        if (dbError) {
          console.error(`DB error for ${url}:`, dbError);
          errors++;
        } else {
          scraped++;
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.error(`Error processing ${url}:`, e);
        errors++;
      }
    }

    const nextOffset = offset + limit;
    const hasMore = nextOffset < urls.length;

    return new Response(
      JSON.stringify({
        success: true,
        total_urls: urls.length,
        batch_size: batch.length,
        scraped,
        errors,
        next_offset: hasMore ? nextOffset : null,
        has_more: hasMore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scrape knowledge error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

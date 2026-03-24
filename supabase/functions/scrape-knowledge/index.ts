import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("scrape-knowledge");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Scrape request received [${requestId}]`, { requestId });

  try {
    const { offset = 0, limit = 10, target_url = "https://guide.techfleet.org" } = await req.json().catch(() => ({}));

    log.info("config", `Scraping target_url="${target_url}", offset=${offset}, limit=${limit} [${requestId}]`, {
      requestId,
      targetUrl: target_url,
      offset,
      limit,
    });

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      log.error("config", `FIRECRAWL_API_KEY not configured [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Map the site
    log.info("map", `Mapping ${target_url} [${requestId}]`, { requestId, targetUrl: target_url });
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
      log.error("map", `Firecrawl map API error [${requestId}]: HTTP ${mapRes.status}`, {
        requestId,
        httpStatus: mapRes.status,
        responseBody: JSON.stringify(mapData).substring(0, 500),
      });
      return new Response(
        JSON.stringify({ success: false, error: "Failed to map site", details: mapData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const urls: string[] = mapData.links || [];
    log.info("map", `Found ${urls.length} URLs. Processing offset=${offset}, limit=${limit} [${requestId}]`, {
      requestId,
      totalUrls: urls.length,
      offset,
      limit,
    });

    const batch = urls.slice(offset, offset + limit);
    log.info("scrape", `Processing batch of ${batch.length} URLs (offset ${offset}) [${requestId}]`, {
      requestId,
      batchSize: batch.length,
      offset,
    });

    let scraped = 0;
    let errors = 0;

    for (const url of batch) {
      try {
        log.info("scrape", `Scraping: ${url} [${requestId}]`, { requestId, url });
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
          log.error("scrape", `Firecrawl scrape error for ${url} [${requestId}]: HTTP ${scrapeRes.status}`, {
            requestId,
            url,
            httpStatus: scrapeRes.status,
            responseBody: JSON.stringify(scrapeData).substring(0, 300),
          });
          errors++;
          continue;
        }

        const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        const title = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || url;

        if (!markdown.trim()) {
          log.warn("scrape", `Empty content for ${url} — skipping [${requestId}]`, { requestId, url });
          continue;
        }

        log.info("upsert", `Upserting ${url} (${markdown.length} chars) [${requestId}]`, {
          requestId,
          url,
          title,
          contentLength: markdown.length,
        });

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
          log.error("upsert", `DB upsert error for ${url} [${requestId}]: ${dbError.message}`, {
            requestId,
            url,
            errorCode: dbError.code,
          }, dbError);
          errors++;
        } else {
          scraped++;
        }

        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        log.error("scrape", `Exception processing ${url} [${requestId}]`, { requestId, url }, e);
        errors++;
      }
    }

    const nextOffset = offset + limit;
    const hasMore = nextOffset < urls.length;

    log.info("handler", `Scrape batch completed [${requestId}]: ${scraped} scraped, ${errors} errors, hasMore=${hasMore}`, {
      requestId,
      totalUrls: urls.length,
      batchSize: batch.length,
      scraped,
      errors,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
    });

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
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

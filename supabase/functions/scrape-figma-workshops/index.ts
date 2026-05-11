// Admin-only: scrape Tech Fleet Figma Community workshop pages via Firecrawl,
// fuzzy-match titles to reference_workshops, and update descriptions.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIGMA_HOST_RE = /^https:\/\/www\.figma\.com\/community\/file\/\d+\/[a-z0-9-]+$/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const ta = new Set(norm(a).split(" ").filter(Boolean));
  const tb = new Set(norm(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function extractDescription(markdown: string, title: string): string {
  // Cut off Figma chrome: keep content from after the title heading through
  // the first occurrence of "More by" / hashtags / "Community Guidelines".
  const lines = markdown.split("\n");
  const titleIdx = lines.findIndex((l) =>
    l.startsWith("# ") && norm(l).includes(norm(title).split(" ")[0])
  );
  const start = titleIdx >= 0 ? titleIdx + 1 : 0;
  const stopMarkers = [
    /^#+\s*more by/i,
    /^\[#[a-z]/i,
    /community guidelines/i,
    /^\[Customer journey\]/i,
    /^!\[.*preview\]/i,
  ];
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (stopMarkers.some((re) => re.test(l.trim()))) break;
    out.push(l);
  }
  return out.join("\n").trim().slice(0, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- AuthZ: admin only ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.slice(7);
    if (token !== SERVICE_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: role } = await admin.from("user_roles").select("id")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!role) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
    const dryRun = !!body.dryRun;
    const safeUrls = urls
      .filter((u) => typeof u === "string" && FIGMA_HOST_RE.test(u))
      .slice(0, 60);

    if (!safeUrls.length) {
      return new Response(JSON.stringify({ error: "No valid figma.com/community/file URLs supplied" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load workshops once for matching
    const { data: workshops, error: wErr } = await admin
      .from("reference_workshops")
      .select("slug,name,description,description_source");
    if (wErr) throw wErr;

    const results: Array<Record<string, unknown>> = [];
    for (const url of safeUrls) {
      try {
        const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });
        const fc = await fcRes.json();
        if (!fcRes.ok) {
          results.push({ url, ok: false, error: `firecrawl ${fcRes.status}`, body: fc });
          continue;
        }
        const md: string = fc?.data?.markdown ?? fc?.markdown ?? "";
        const title: string = (fc?.data?.metadata?.title ?? fc?.metadata?.title ?? "").replace(/\s*\|\s*Figma\s*$/, "").trim();
        const description = extractDescription(md, title);
        if (!title || description.length < 80) {
          results.push({ url, ok: false, error: "no_description", title, mdLen: md.length });
          continue;
        }
        // Fuzzy-match
        let best = { score: 0, slug: "", name: "" };
        for (const w of workshops ?? []) {
          const s = similarity(title, w.name);
          if (s > best.score) best = { score: s, slug: w.slug, name: w.name };
        }
        const matched = best.score >= 0.45 ? best : null;
        if (!matched) {
          results.push({ url, ok: false, error: "no_match", title, best_score: best.score, best_name: best.name });
          continue;
        }
        if (dryRun) {
          results.push({ url, ok: true, dryRun: true, title, match: matched, descLen: description.length });
          continue;
        }
        // Skip admin-edited rows
        const existing = workshops?.find((w) => w.slug === matched.slug);
        if (existing?.description_source === "admin") {
          results.push({ url, ok: true, skipped: "admin_edit_protected", title, match: matched });
          continue;
        }
        const { error: upErr } = await admin
          .from("reference_workshops")
          .update({
            description,
            description_source: "csv",
            description_generated_at: new Date().toISOString(),
          })
          .eq("slug", matched.slug);
        if (upErr) {
          results.push({ url, ok: false, error: upErr.message, match: matched });
        } else {
          results.push({ url, ok: true, title, match: matched, score: matched.score, descLen: description.length });
          // Best-effort Fleety re-embed
          await admin.functions.invoke("fleety-embed", {
            body: { slugs: [`framework://workshops/${matched.slug}`] },
          }).catch(() => {});
        }
      } catch (e) {
        results.push({ url, ok: false, error: (e as Error).message });
      }
      // Politeness delay
      await new Promise((r) => setTimeout(r, 600));
    }

    const updated = results.filter((r) => r.ok && !r.skipped && !r.dryRun).length;
    return new Response(JSON.stringify({ ok: true, total: safeUrls.length, updated, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

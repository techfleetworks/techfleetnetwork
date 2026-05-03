// Fleety Embedding service — generates 768-dim vectors for KB, playbooks, examples.
// Two modes:
//   POST { text: "..." }                 -> returns { embedding: number[] }   (auth: any signed-in user)
//   POST { mode: "backfill", limit?: 50, table?: "kb"|"playbooks"|"examples"|"all" }
//                                         -> embeds rows whose embedding IS NULL  (auth: admin or service role)
//
// Embeddings provider: Google Gemini text-embedding-004 (768-dim, free tier).
// Called directly via the Generative Language API using LOVABLE_API_KEY-style fallback:
//   - Prefer GEMINI_API_KEY when set
//   - Fall back to LOVABLE_API_KEY against the gateway's /v1/embeddings (OpenAI-compatible)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const EMBED_DIM = 768;

async function embedText(text: string): Promise<number[]> {
  const trimmed = (text || "").slice(0, 8000);
  if (!trimmed.trim()) return new Array(EMBED_DIM).fill(0);

  // Path A: direct Gemini API
  if (GEMINI_API_KEY) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: trimmed }] },
        }),
      },
    );
    if (!r.ok) throw new Error(`Gemini embed failed: ${r.status} ${await r.text()}`);
    const j = await r.json();
    const v = j?.embedding?.values;
    if (!Array.isArray(v) || v.length !== EMBED_DIM) {
      throw new Error(`Unexpected Gemini embedding shape (len=${v?.length})`);
    }
    return v;
  }

  // Path B: gateway OpenAI-compatible (best-effort)
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/text-embedding-004",
      input: trimmed,
    }),
  });
  if (!r.ok) throw new Error(`Gateway embed failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const v = j?.data?.[0]?.embedding;
  if (!Array.isArray(v)) throw new Error("Unexpected gateway embedding shape");
  // If gateway returns 1536-dim, truncate to 768 (lossy but functional fallback)
  return v.length === EMBED_DIM ? v : v.slice(0, EMBED_DIM);
}

function vecLiteral(v: number[]): string {
  return "[" + v.join(",") + "]";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron / service-role path: bearer token == service role key OR
    // x-cron-secret matches CRON_SECRET. No user check; backfill only.
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const isService = auth === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    const isCron = CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
    const isBackfill = body?.mode === "backfill";

    let isAdmin = false;
    let needsAuth = !(isService || isCron && isBackfill);

    if (needsAuth) {
      if (!auth.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    }

    // Mode A: single embedding for query-time use
    if (typeof body.text === "string") {
      const v = await embedText(body.text);
      return new Response(JSON.stringify({ embedding: v }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode B: backfill — admin only
    if (body.mode === "backfill") {
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
      const table = (body.table as string) || "all";
      const result: Record<string, number> = {};

      // KB: title + content
      if (table === "all" || table === "kb") {
        const { data: rows } = await admin
          .from("knowledge_base")
          .select("id,title,content")
          .is("embedding", null)
          .limit(limit);
        let n = 0;
        for (const r of rows ?? []) {
          try {
            const v = await embedText(`${r.title}\n\n${r.content}`);
            await admin
              .from("knowledge_base")
              .update({ embedding: vecLiteral(v) as unknown as number[], embedding_updated_at: new Date().toISOString() })
              .eq("id", r.id);
            n++;
          } catch (e) {
            console.error("kb embed fail", r.id, e);
          }
        }
        result.kb = n;
      }

      if (table === "all" || table === "playbooks") {
        const { data: rows } = await admin
          .from("fleety_playbooks")
          .select("id,title,direct_answer,trigger_phrases,tags,intent")
          .is("embedding", null)
          .limit(limit);
        let n = 0;
        for (const r of rows ?? []) {
          try {
            const blob = `${r.title}\nintent:${r.intent}\n${(r.trigger_phrases ?? []).join(", ")}\n${(r.tags ?? []).join(", ")}\n${r.direct_answer ?? ""}`;
            const v = await embedText(blob);
            await admin
              .from("fleety_playbooks")
              .update({ embedding: vecLiteral(v) as unknown as number[], embedding_updated_at: new Date().toISOString() })
              .eq("id", r.id);
            n++;
          } catch (e) {
            console.error("playbook embed fail", r.id, e);
          }
        }
        result.playbooks = n;
      }

      if (table === "all" || table === "examples") {
        const { data: rows } = await admin
          .from("fleety_examples")
          .select("id,title,deliverable_type,summary,excerpt,tags")
          .is("embedding", null)
          .limit(limit);
        let n = 0;
        for (const r of rows ?? []) {
          try {
            const blob = `${r.title}\n${r.deliverable_type}\n${(r.tags ?? []).join(", ")}\n${r.summary ?? ""}\n${r.excerpt ?? ""}`;
            const v = await embedText(blob);
            await admin
              .from("fleety_examples")
              .update({ embedding: vecLiteral(v) as unknown as number[], embedding_updated_at: new Date().toISOString() })
              .eq("id", r.id);
            n++;
          } catch (e) {
            console.error("example embed fail", r.id, e);
          }
        }
        result.examples = n;
      }

      return new Response(JSON.stringify({ ok: true, embedded: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide { text } or { mode: 'backfill' }" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fleety-embed error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

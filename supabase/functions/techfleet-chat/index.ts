import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("techfleet-chat");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Fleety, the official Tech Fleet Assistant — a helpful AI that answers questions about Tech Fleet, its community, processes, team practices, workshops, handbooks, and onboarding.

IMPORTANT RULES:
1. ALWAYS start by checking the Tech Fleet knowledge base provided below. This is your PRIMARY source of truth for all Tech Fleet-specific information.
2. If a question is not related to Tech Fleet, politely redirect the user to ask about Tech Fleet topics.
3. If you don't have enough information in the knowledge base to answer a question, say so honestly rather than making up an answer.
4. Do not discuss topics outside of Tech Fleet, even if the user insists.
5. When a user asks HOW to complete a deliverable, workshop activity, milestone, team hat responsibility, or any practical task mentioned in the knowledge base, you SHOULD supplement your answer with practical tips, best practices, and step-by-step guidance. Use the WEB SEARCH RESULTS provided below to enrich your answer with real-world techniques and industry best practices.
6. Always clearly distinguish between official Tech Fleet processes (from the knowledge base) and supplementary tips (from web search). Use a section like "💡 Practical Tips" for web-sourced advice.

FORMATTING RULES — follow these strictly:
1. Use clear markdown formatting: headings (##), bullet points, bold for key terms, and numbered lists where appropriate.
2. Keep paragraphs short (2-3 sentences max) for easy scanning.
3. Use line breaks between sections for readability.
4. When listing items, always use bullet points or numbered lists — never a wall of text.

SOURCE CITATION RULES — follow these strictly:
1. ALWAYS cite your sources at the end of your answer in a "📚 Sources" section.
2. For each source, include the title and a clickable markdown link using the URL from the knowledge base.
3. Only cite sources you actually used to form your answer.
4. Format sources as a bulleted list like:
   - [Source Title](url)
5. If a source URL starts with "csv://", do NOT include it as a link — instead just mention it as internal reference data (e.g., "Based on Tech Fleet's Skills Framework data").
6. For Notion URLs, use the full URL as the link.
7. For guide.techfleet.org URLs, use the full URL as the link.
8. For web search sources, include the URL with a 🌐 prefix like:
   - 🌐 [Article Title](url)

WORKSHOP IMAGE RULES — follow these strictly:
1. When answering about a specific workshop, if the knowledge base entry contains a "Workshop Preview Image" markdown image tag, ALWAYS include it in your response so the user can see what the workshop looks like.
2. Render the image using the exact markdown syntax from the knowledge base: ![Workshop Preview](image_url)
3. Place the image near the top of your answer, right after the workshop title.

KNOWLEDGE BASE:
`;

/** Max request body (64 KB — allows for conversation history) */
const MAX_BODY_BYTES = 64 * 1024;
/** Max messages in a single request to prevent abuse */
const MAX_MESSAGES = 50;
/** Max length per message content */
const MAX_MESSAGE_LENGTH = 4000;
/** Firecrawl search timeout in ms */
const WEB_SEARCH_TIMEOUT_MS = 5000;

/**
 * Trusted, reputable domains for web search results.
 * Only results from these domains will be returned by Firecrawl.
 */
const TRUSTED_DOMAINS = [
  "harvard.edu",
  "hbr.org",
  "atlassian.com",
  "scrumalliance.org",
  "scrum.org",
  "agilealliance.org",
  "nngroup.com",
  "interaction-design.org",
  "smashingmagazine.com",
  "uxdesign.cc",
  "medium.com",
  "wikipedia.org",
  "coursera.org",
  "edx.org",
  "linkedin.com/pulse",
  "thoughtworks.com",
  "martinfowler.com",
  "mckinsey.com",
  "deloitte.com",
  "productplan.com",
  "mindtheproduct.com",
  "svpg.com",
  "leanagile.pm",
  "figma.com",
  "miro.com",
  "notion.so",
  "asana.com",
  "monday.com",
  "pmi.org",
  "aiga.org",
  "designcouncil.org.uk",
  "gov.uk",
  "digital.gov",
  "18f.gsa.gov",
  "usability.gov",
  "w3.org",
  "developer.mozilla.org",
];

/**
 * Keywords that indicate the user wants practical/how-to guidance,
 * triggering a web search for supplementary tips.
 */
const HOW_TO_PATTERNS = [
  /\bhow\s+(do|to|can|should|would)\b/i,
  /\bsteps?\s+(to|for)\b/i,
  /\btips?\s+(for|on|to)\b/i,
  /\bbest\s+practi[cs]e/i,
  /\bguide\s+(to|for|on)\b/i,
  /\bcomplete\s+(the|a|my)\b/i,
  /\bdeliver(able)?s?\b/i,
  /\bworkshop\b/i,
  /\bmilestone\b/i,
  /\bactivit(y|ies)\b/i,
  /\bhat(s)?\b.*\bteam\b/i,
  /\bteam\b.*\bhat(s)?\b/i,
  /\bwhat\s+(is|are)\b/i,
  /\bexplain\b/i,
  /\bexample/i,
  /\btemplate/i,
  /\bcreate\s+(a|the|my)\b/i,
  /\bwrite\s+(a|the|my)\b/i,
  /\bprepare\s+(a|the|for)\b/i,
  /\bconduct\s+(a|the)\b/i,
  /\bfacilitat/i,
  /\brun\s+(a|the)\b/i,
];

function shouldSearchWeb(userMessage: string): boolean {
  return HOW_TO_PATTERNS.some((p) => p.test(userMessage));
}

/**
 * Extract a concise search query from the user message for web search.
 * Strips filler words and keeps topic-relevant terms.
 */
function buildSearchQuery(userMessage: string): string {
  // Take the last user message, trim to 120 chars, remove filler
  const trimmed = userMessage.slice(0, 200).replace(/\b(please|can you|could you|i want to|i need to|tell me|help me)\b/gi, "").trim();
  // Prefix with context so results are relevant
  return `how to ${trimmed} best practices tips`;
}

/**
 * Search the web via Firecrawl for supplementary tips.
 * Returns formatted context string or empty string on failure.
 */
async function searchWebForTips(query: string): Promise<{ context: string; sources: { title: string; url: string }[] }> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    log.warn("web-search", "FIRECRAWL_API_KEY not configured, skipping web search");
    return { context: "", sources: [] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 8,
        search_domain_filter: TRUSTED_DOMAINS,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn("web-search", `Firecrawl returned ${response.status}`);
      return { context: "", sources: [] };
    }

    const data = await response.json();
    const results = data?.data || [];
    if (!Array.isArray(results) || results.length === 0) {
      return { context: "", sources: [] };
    }

    const sources: { title: string; url: string }[] = [];
    let context = "\n\nWEB SEARCH RESULTS (use these to supplement your answer with practical tips and best practices):\n";

    for (const result of results.slice(0, 5)) {
      const title = result.title || "Untitled";
      const url = result.url || "";
      const content = (result.markdown || result.description || "").slice(0, 1500);

      if (!content) continue;

      context += `\n---\nWEB SOURCE: ${title} (${url})\n${content}\n`;
      sources.push({ title, url });
    }

    log.info("web-search", `Found ${sources.length} web results`);
    return { context, sources };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      log.warn("web-search", "Web search timed out");
    } else {
      log.warn("web-search", `Web search failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
    return { context: "", sources: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Chat request received [${requestId}]`, { requestId });

  try {
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) {
      log.warn("handler", `Request body too large [${requestId}]: ${contentLength} bytes`, { requestId, contentLength });
      return new Response(
        JSON.stringify({ error: "Request body too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (messages.length > MAX_MESSAGES) {
      log.warn("handler", `Too many messages [${requestId}]: ${messages.length}`, { requestId });
      return new Response(
        JSON.stringify({ error: `Maximum ${MAX_MESSAGES} messages allowed per request` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validRoles = new Set(["user", "assistant", "system"]);
    for (const msg of messages) {
      if (!msg.role || !validRoles.has(msg.role)) {
        return new Response(
          JSON.stringify({ error: "Invalid message role" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (typeof msg.content !== "string" || msg.content.length > MAX_MESSAGE_LENGTH) {
        return new Response(
          JSON.stringify({ error: `Message content must be a string under ${MAX_MESSAGE_LENGTH} characters` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const lastUserMessage = messages.filter((m: { role: string }) => m.role === "user").pop()?.content || "";
    log.info("chat", `Processing ${messages.length} messages [${requestId}]`, {
      requestId,
      messageCount: messages.length,
      lastUserMessage: lastUserMessage.substring(0, 100),
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      log.error("config", `LOVABLE_API_KEY is not configured [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load knowledge base and optionally search web in parallel
    const doWebSearch = shouldSearchWeb(lastUserMessage);
    log.info("web-search", `Web search decision [${requestId}]: ${doWebSearch}`, { requestId, doWebSearch });

    const [kbResult, webResult] = await Promise.all([
      supabase.from("knowledge_base").select("title, content, url").order("title"),
      doWebSearch ? searchWebForTips(buildSearchQuery(lastUserMessage)) : Promise.resolve({ context: "", sources: [] }),
    ]);

    const { data: knowledge, error: kbError } = kbResult;

    if (kbError) {
      log.error("kb", `Failed to load knowledge base [${requestId}]: ${kbError.message}`, { requestId }, kbError);
    } else {
      log.info("kb", `Loaded ${knowledge?.length ?? 0} KB entries [${requestId}]`, { requestId, entryCount: knowledge?.length ?? 0 });
    }

    let knowledgeContext = "";
    if (knowledge && knowledge.length > 0) {
      for (const entry of knowledge) {
        const truncatedContent = entry.content.length > 3000 ? entry.content.substring(0, 3000) + "...[truncated]" : entry.content;
        knowledgeContext += `\n---\nSOURCE: ${entry.title} (${entry.url})\n${truncatedContent}\n`;
      }
    } else {
      knowledgeContext = "\nNo knowledge base content available yet. Let the user know the knowledge base is being set up.\n";
    }

    const fullSystemPrompt = SYSTEM_PROMPT + knowledgeContext + webResult.context;
    log.info("ai", `Sending request to AI gateway [${requestId}]`, {
      requestId,
      model: "google/gemini-3-flash-preview",
      systemPromptLength: fullSystemPrompt.length,
      webSourceCount: webResult.sources.length,
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: fullSystemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        log.warn("ai", `AI gateway rate limit exceeded [${requestId}]`, { requestId, httpStatus: 429 });
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        log.warn("ai", `AI usage limit reached [${requestId}]`, { requestId, httpStatus: 402 });
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      log.error("ai", `AI gateway error [${requestId}]: HTTP ${response.status} — ${t.substring(0, 500)}`, {
        requestId,
        httpStatus: response.status,
        responseBody: t.substring(0, 500),
      });
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info("ai", `AI gateway streaming response started [${requestId}]`, { requestId });
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

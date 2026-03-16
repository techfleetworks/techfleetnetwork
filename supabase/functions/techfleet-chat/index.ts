import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("techfleet-chat");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Fleety, the official Tech Fleet Assistant — a helpful AI that answers questions exclusively about Tech Fleet, its community, processes, team practices, workshops, handbooks, and onboarding.

IMPORTANT RULES:
1. ONLY answer questions using the Tech Fleet knowledge base provided below. Do NOT use any external knowledge or information from the internet.
2. If a question is not related to Tech Fleet, politely redirect the user to ask about Tech Fleet topics.
3. If you don't have enough information in the knowledge base to answer a question, say so honestly rather than making up an answer.
4. Do not discuss topics outside of Tech Fleet, even if the user insists.

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

WORKSHOP IMAGE RULES — follow these strictly:
1. When answering about a specific workshop, if the knowledge base entry contains a "Workshop Preview Image" markdown image tag, ALWAYS include it in your response so the user can see what the workshop looks like.
2. Render the image using the exact markdown syntax from the knowledge base: ![Workshop Preview](image_url)
3. Place the image near the top of your answer, right after the workshop title.

KNOWLEDGE BASE:
`;


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Chat request received [${requestId}]`, { requestId });

  try {
    const { messages } = await req.json();
    log.info("chat", `Processing ${messages?.length ?? 0} messages [${requestId}]`, {
      requestId,
      messageCount: messages?.length ?? 0,
      lastUserMessage: messages?.[messages.length - 1]?.content?.substring(0, 100),
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      log.error("config", `LOVABLE_API_KEY is not configured [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    log.info("kb", `Loading knowledge base [${requestId}]`, { requestId });
    const { data: knowledge, error: kbError } = await supabase
      .from("knowledge_base")
      .select("title, content, url")
      .order("title");

    if (kbError) {
      log.error("kb", `Failed to load knowledge base [${requestId}]: ${kbError.message}`, { requestId }, kbError);
    } else {
      log.info("kb", `Loaded ${knowledge?.length ?? 0} knowledge base entries [${requestId}]`, {
        requestId,
        entryCount: knowledge?.length ?? 0,
      });
    }

    let knowledgeContext = "";
    if (knowledge && knowledge.length > 0) {
      for (const entry of knowledge) {
        const truncatedContent = entry.content.length > 3000
          ? entry.content.substring(0, 3000) + "...[truncated]"
          : entry.content;
        knowledgeContext += `\n---\nSOURCE: ${entry.title} (${entry.url})\n${truncatedContent}\n`;
      }
    } else {
      knowledgeContext = "\nNo knowledge base content available yet. Let the user know the knowledge base is being set up.\n";
    }

    const fullSystemPrompt = SYSTEM_PROMPT + knowledgeContext;
    log.info("ai", `Sending request to AI gateway [${requestId}]`, {
      requestId,
      model: "google/gemini-3-flash-preview",
      systemPromptLength: fullSystemPrompt.length,
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        log.warn("ai", `AI gateway rate limit exceeded [${requestId}]`, { requestId, httpStatus: 429 });
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        log.warn("ai", `AI usage limit reached [${requestId}]`, { requestId, httpStatus: 402 });
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      log.error("ai", `AI gateway error [${requestId}]: HTTP ${response.status} — ${t.substring(0, 500)}`, {
        requestId,
        httpStatus: response.status,
        responseBody: t.substring(0, 500),
      });
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("ai", `AI gateway streaming response started [${requestId}]`, { requestId });
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

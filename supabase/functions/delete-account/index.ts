import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("delete-account");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Request received [${requestId}]`, { requestId, method: req.method });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log.warn("auth", `Missing Authorization header [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!clientKey) {
      throw new Error("Missing SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY for authenticated client creation.");
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      clientKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    log.info("auth", `Verifying user token [${requestId}]`, { requestId });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      log.warn("auth", `Invalid or expired token [${requestId}]: ${userError?.message ?? "no user returned"}`, { requestId }, userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    log.info("auth", `User verified [${requestId}]: ${userId}`, { requestId, userId, email: user.email });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete user data from all tables (children before parents)
    // Step 1: Get conversation IDs to delete messages
    log.info("delete", `Fetching conversations for user ${userId} [${requestId}]`, { requestId, userId });
    const { data: convos, error: convosError } = await supabaseAdmin
      .from("chat_conversations")
      .select("id")
      .eq("user_id", userId);

    if (convosError) {
      log.error("delete", `Failed to fetch conversations for user ${userId} [${requestId}]: ${convosError.message}`, { requestId, userId }, convosError);
    }

    if (convos && convos.length > 0) {
      const convoIds = convos.map((c) => c.id);
      log.info("delete", `Deleting ${convoIds.length} conversations' messages for user ${userId} [${requestId}]`, { requestId, userId, conversationCount: convoIds.length });
      
      const { error: msgsError } = await supabaseAdmin.from("chat_messages").delete().in("conversation_id", convoIds);
      if (msgsError) {
        log.error("delete", `Failed to delete chat_messages for user ${userId} [${requestId}]: ${msgsError.message}`, { requestId, userId }, msgsError);
      } else {
        log.info("delete", `Deleted chat_messages for user ${userId} [${requestId}]`, { requestId, userId });
      }
    } else {
      log.info("delete", `No conversations to clean up for user ${userId} [${requestId}]`, { requestId, userId });
    }

    // Step 2: Delete conversations
    log.info("delete", `Deleting chat_conversations for user ${userId} [${requestId}]`, { requestId, userId });
    const { error: convDelErr } = await supabaseAdmin.from("chat_conversations").delete().eq("user_id", userId);
    if (convDelErr) {
      log.error("delete", `Failed to delete chat_conversations for user ${userId} [${requestId}]: ${convDelErr.message}`, { requestId, userId }, convDelErr);
    }

    // Step 3: Delete journey progress
    log.info("delete", `Deleting journey_progress for user ${userId} [${requestId}]`, { requestId, userId });
    const { error: jpErr } = await supabaseAdmin.from("journey_progress").delete().eq("user_id", userId);
    if (jpErr) {
      log.error("delete", `Failed to delete journey_progress for user ${userId} [${requestId}]: ${jpErr.message}`, { requestId, userId }, jpErr);
    }

    // Step 4: Delete audit log entries
    log.info("delete", `Deleting audit_log entries for user ${userId} [${requestId}]`, { requestId, userId });
    const { error: auditErr } = await supabaseAdmin.from("audit_log").delete().eq("user_id", userId);
    if (auditErr) {
      log.error("delete", `Failed to delete audit_log for user ${userId} [${requestId}]: ${auditErr.message}`, { requestId, userId }, auditErr);
    }

    // Step 5: Delete profile
    log.info("delete", `Deleting profile for user ${userId} [${requestId}]`, { requestId, userId });
    const { error: profileErr } = await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    if (profileErr) {
      log.error("delete", `Failed to delete profile for user ${userId} [${requestId}]: ${profileErr.message}`, { requestId, userId }, profileErr);
    }

    // Step 6: Delete the auth user (permanent)
    log.info("delete", `Deleting auth user ${userId} [${requestId}]`, { requestId, userId });
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      log.error("delete", `Failed to delete auth user ${userId} [${requestId}]: ${deleteError.message}`, { requestId, userId }, deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("handler", `Account deletion completed successfully for user ${userId} [${requestId}]`, { requestId, userId });
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

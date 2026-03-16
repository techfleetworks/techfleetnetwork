import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("sign-out-all-devices");

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
  log.info("handler", `Request received [${requestId}]`, { requestId });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log.warn("auth", `Missing Authorization header [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    log.info("auth", `Verifying user token [${requestId}]`, { requestId });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      log.warn("auth", `Token verification failed [${requestId}]: ${userError?.message ?? "no user returned"}`, { requestId }, userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("revoke", `Revoking all sessions for user ${user.id} [${requestId}]`, { requestId, userId: user.id, email: user.email });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user.id, "global");
    if (signOutError) {
      log.error("revoke", `Failed to revoke sessions for user ${user.id} [${requestId}]: ${signOutError.message}`, { requestId, userId: user.id }, signOutError);
      return new Response(
        JSON.stringify({ error: "Failed to revoke sessions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("revoke", `All sessions revoked for user ${user.id} [${requestId}]`, { requestId, userId: user.id });
    return new Response(
      JSON.stringify({ success: true, message: "All sessions revoked" }),
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

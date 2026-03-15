import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier, action } = await req.json();

    // Validate inputs
    const VALID_ACTIONS = ["login_attempt", "signup_attempt", "password_reset"];
    if (!identifier || typeof identifier !== "string" || identifier.length > 255) {
      return new Response(
        JSON.stringify({ error: "Invalid identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!action || !VALID_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash the identifier server-side so we never store raw emails/IPs
    const encoder = new TextEncoder();
    const data = encoder.encode(identifier + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedIdentifier = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: result, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: hashedIdentifier,
      p_action: action,
      p_max_attempts: action === "login_attempt" ? 5 : 3,
      p_window_minutes: 15,
      p_block_minutes: action === "login_attempt" ? 30 : 60,
    });

    if (error) {
      console.error("Rate limit check failed");
      // Fail open to not block legitimate users, but log the error
      return new Response(
        JSON.stringify({ allowed: true, remaining: 0, retry_after: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const statusCode = result.allowed ? 200 : 429;
    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        ...(result.retry_after > 0 && { "Retry-After": String(result.retry_after) }),
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Bad request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

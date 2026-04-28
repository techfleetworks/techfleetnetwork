import { corsHeaders } from "npm:@supabase/supabase-js@2.99.1/cors";
import { z } from "npm:zod@4.3.6";

const BodySchema = z.object({
  token: z.string().trim().min(20).max(4096),
  action: z.enum(["login", "register", "forgot_password", "signup_confirmation_resend"]),
});

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return jsonResponse({ success: false, error: "Verification is not configured" }, 500);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ success: false, error: "Complete the human verification before trying again." }, 400);
    }

    const form = new FormData();
    form.set("secret", secret);
    form.set("response", parsed.data.token);

    const response = await fetch(VERIFY_URL, { method: "POST", body: form });
    const result = await response.json().catch(() => ({})) as { success?: boolean; hostname?: string; "error-codes"?: string[] };

    if (!response.ok || result.success !== true) {
      console.warn("Turnstile verification failed", { action: parsed.data.action, status: response.status, errorCodes: result["error-codes"] ?? [] });
      return jsonResponse({ success: false, error: "Complete the human verification before trying again." }, 403);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Turnstile verification error", error);
    return jsonResponse({ success: false, error: "Verification failed. Please try again." }, 500);
  }
});
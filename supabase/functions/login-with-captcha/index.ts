import { corsHeaders } from "npm:@supabase/supabase-js@2.99.1/cors";
import { z } from "npm:zod@4.3.6";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("login-with-captcha");
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const DnsAnswerSchema = z.object({ Answer: z.array(z.unknown()).optional(), Status: z.number().optional() }).passthrough();

const BodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(4096),
  captchaToken: z.string().trim().min(20).max(4096),
});

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clientIp(req: Request): string | undefined {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

function publicAuthError(status = 401) {
  return jsonResponse({ error: "Invalid email or password. Please try again." }, status);
}

function emailDomain(email: string): string {
  return email.toLowerCase().split("@").pop()?.replace(/\.+$/, "") ?? "";
}

async function hasDnsRecord(domain: string, type: "MX" | "A" | "AAAA"): Promise<boolean> {
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) return false;
  const parsed = DnsAnswerSchema.safeParse(await response.json());
  return parsed.success && parsed.data.Status === 0 && Array.isArray(parsed.data.Answer) && parsed.data.Answer.length > 0;
}

async function validateDomain(domain: string): Promise<boolean> {
  if (!DOMAIN_RE.test(domain)) return false;
  return (await hasDnsRecord(domain, "MX")) || (await hasDnsRecord(domain, "A")) || (await hasDnsRecord(domain, "AAAA"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!secret || !supabaseUrl || !anonKey) {
      log.error("config", `Login CAPTCHA configuration missing [${requestId}]`, { requestId });
      return jsonResponse({ error: "Verification is temporarily unavailable. Please try again." }, 503);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      log.warn("validate", `Invalid login payload [${requestId}]`, { requestId });
      return jsonResponse({ error: "Complete the human verification before trying again." }, 400);
    }

    if (!(await validateDomain(emailDomain(parsed.data.email)))) {
      log.warn("validate", `Rejected login with non-existent email domain [${requestId}]`, { requestId });
      return jsonResponse({ error: "Use an email address with a real domain." }, 400);
    }

    const verifyForm = new FormData();
    verifyForm.set("secret", secret);
    verifyForm.set("response", parsed.data.captchaToken);
    const ip = clientIp(req);
    if (ip) verifyForm.set("remoteip", ip);

    const captchaResponse = await fetch(VERIFY_URL, { method: "POST", body: verifyForm });
    const captchaResult = await captchaResponse.json().catch(() => ({})) as { success?: boolean; "error-codes"?: string[] };
    if (!captchaResponse.ok || captchaResult.success !== true) {
      log.warn("captcha", `Turnstile rejected login [${requestId}]`, {
        requestId,
        status: captchaResponse.status,
        errorCodes: captchaResult["error-codes"] ?? [],
      });
      return jsonResponse({ error: "Complete the human verification before trying again.", code: "CAPTCHA_REQUIRED" }, 403);
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
    });

    const authBody = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok) {
      log.warn("auth", `Password login rejected after CAPTCHA [${requestId}]`, { requestId, status: authResponse.status });
      if (authResponse.status === 429) {
        return jsonResponse(
          { error: "Too many rapid auth attempts. Complete the human verification before trying again.", code: "AUTH_THROTTLE_CAPTCHA_REQUIRED" },
          429,
          { "Retry-After": authResponse.headers.get("Retry-After") ?? "60" },
        );
      }
      return publicAuthError(authResponse.status === 400 ? 401 : authResponse.status);
    }

    log.info("auth", `Password login passed server CAPTCHA gate [${requestId}]`, { requestId });
    return jsonResponse({ session: authBody, user: authBody.user ?? null });
  } catch (err) {
    log.error("handler", `Unhandled login CAPTCHA error [${requestId}]`, { requestId }, err);
    return jsonResponse({ error: "Verification failed. Please try again." }, 500);
  }
});

import { z } from "npm:zod@4.3.6";
import { handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("validate-email-domain");
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const DnsAnswerSchema = z.object({ Answer: z.array(z.unknown()).optional(), Status: z.number().optional() }).passthrough();
const BodySchema = z.object({ domain: z.string().trim().toLowerCase().min(4).max(253).regex(DOMAIN_RE) });

async function hasDnsRecord(domain: string, type: "MX" | "A" | "AAAA"): Promise<boolean> {
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) return false;
  const parsed = DnsAnswerSchema.safeParse(await response.json());
  return parsed.success && parsed.data.Status === 0 && Array.isArray(parsed.data.Answer) && parsed.data.Answer.length > 0;
}

export async function validateDomain(domain: string): Promise<boolean> {
  return (await hasDnsRecord(domain, "MX")) || (await hasDnsRecord(domain, "A")) || (await hasDnsRecord(domain, "AAAA"));
}

Deno.serve(async (req) => {
  // @public-route Pre-auth email signup helper. Input is domain-only and server-side validated.
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ valid: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const parsed = BodySchema.safeParse(await parseJsonBody(req, 2 * 1024));
    if (!parsed.success) return jsonResponse({ valid: false, error: "Enter a valid email address." }, 400);

    const valid = await validateDomain(parsed.data.domain);
    if (!valid) log.warn("domain", `Rejected non-existent email domain [${requestId}]`, { requestId, domainLength: parsed.data.domain.length });
    return jsonResponse({ valid });
  } catch (err) {
    log.warn("domain", `Domain validation failed open [${requestId}]`, { requestId }, err);
    return jsonResponse({ valid: true, warning: "Domain check unavailable" });
  }
});

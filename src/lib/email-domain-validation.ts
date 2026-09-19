import { invokeEdge } from "@/lib/edge/invokeEdge";
import { getEmailDomain } from "@/lib/validators/auth";

const DOMAIN_CACHE_TTL_MS = 10 * 60_000;
const domainCache = new Map<string, { valid: boolean; checkedAt: number }>();

export async function validateEmailDomainExists(
  email: string
): Promise<{ valid: boolean; message?: string }> {
  const domain = getEmailDomain(email);
  if (!domain) return { valid: false, message: "Enter a valid email address." };

  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.checkedAt < DOMAIN_CACHE_TTL_MS)
    return {
      valid: cached.valid,
      message: cached.valid ? undefined : "Use an email address with a real domain.",
    };

  // invokeEdge throws on failure; fail OPEN (allow the email) so a validation-service outage never
  // blocks registration — same behavior as the old `if (error) return { valid: true }`.
  let data: { valid: boolean; error?: string } | undefined;
  try {
    data = await invokeEdge<{ valid: boolean; error?: string }>("validate-email-domain", {
      body: { domain },
      silentReport: true,
    });
  } catch {
    return { valid: true };
  }
  const valid = data?.valid !== false;
  domainCache.set(domain, { valid, checkedAt: Date.now() });
  return { valid, message: valid ? undefined : "Use an email address with a real domain." };
}

export const __emailDomainValidationTestHooks = { domainCache };

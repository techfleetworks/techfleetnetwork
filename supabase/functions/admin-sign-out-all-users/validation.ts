const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthUserForRevocation {
  id: string;
}

export interface SignOutFailure {
  user_id: string;
  code: string;
}

export function normalizeRevocationUsers(users: unknown): AuthUserForRevocation[] {
  if (!Array.isArray(users)) return [];
  const seen = new Set<string>();
  const normalized: AuthUserForRevocation[] = [];

  for (const user of users) {
    const id = user && typeof user === "object" ? (user as Record<string, unknown>).id : null;
    if (typeof id !== "string") continue;
    const cleanId = id.trim().toLowerCase();
    if (!UUID_PATTERN.test(cleanId) || seen.has(cleanId)) continue;
    seen.add(cleanId);
    normalized.push({ id: cleanId });
  }

  return normalized;
}

export function toSafeSignOutFailures(failures: Array<{ user_id: string; error?: unknown }>, maxFailures = 20): SignOutFailure[] {
  return failures.slice(0, maxFailures).map((failure) => ({
    user_id: failure.user_id,
    code: classifyFailure(failure.error),
  }));
}

function classifyFailure(error: unknown): string {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (/rate|too many|429/i.test(message)) return "rate_limited";
  if (/not found|404/i.test(message)) return "not_found";
  if (/permission|forbidden|unauthor/i.test(message)) return "authorization_failed";
  return "provider_error";
}

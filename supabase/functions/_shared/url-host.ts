// Hostname classification for URL values — the shared owner so no handler
// re-introduces a substring host check.
//
// WHY: `value.includes("airtableusercontent.com")` (and any substring host
// test) matches `evil-airtableusercontent.com.attacker.test` and
// `x.com/?u=airtableusercontent.com` — it is not anchored to the host
// (CodeQL js/incomplete-url-substring-sanitization). Parse the URL and compare
// the hostname by exact match or dotted suffix instead.

/**
 * True when `value` is a URL whose hostname is exactly `domain` or a subdomain
 * of it (dotted-suffix match). Non-URL values return false.
 */
export function urlHostnameEndsWith(value: string, domain: string): boolean {
  const host = hostnameOf(value);
  if (!host) return false;
  const d = domain.toLowerCase().replace(/^\.+/, "");
  return host === d || host.endsWith("." + d);
}

/** Lowercased hostname of a URL, or null if `value` is not a parseable URL. */
export function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Airtable serves attachments from *.airtableusercontent.com. */
export function isAirtableAttachmentUrl(value: string): boolean {
  return urlHostnameEndsWith(value, "airtableusercontent.com");
}

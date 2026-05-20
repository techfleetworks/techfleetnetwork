/**
 * Shared Discord username helpers.
 *
 * Two purposes:
 *  1. `isUsableDiscordUsername` — used at render time to decide whether a stored
 *     value can be displayed as `@{value}` without producing "@" or "@.".
 *  2. `normalizeDiscordSearchInput` — used when sending the member-search query
 *     to `resolve-discord-id`. Critically, it NEVER prepends a `.` — that legacy
 *     behavior produced bogus stored usernames like `.alice` (or just `.`) when
 *     the value flowed back through an older save path.
 */

export function isUsableDiscordUsername(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === ".") return false;
  // Strip leading dots and re-trim. If nothing remains, it's just dots/whitespace.
  const stripped = trimmed.replace(/^\.+/, "").trim();
  return stripped.length > 0;
}

export function normalizeDiscordSearchInput(raw: string): string {
  if (typeof raw !== "string") return "";
  let name = raw.trim();
  if (name.startsWith("@")) name = name.slice(1);
  return name.toLowerCase();
}

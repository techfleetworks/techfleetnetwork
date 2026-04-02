/**
 * Shared client-side title extraction for certification cards.
 * Used as a FALLBACK only — the canonical title is `display_title` computed
 * server-side at sync time. This exists only for legacy rows that were
 * synced before display_title was introduced.
 */

const MONTH_RE = /\s*-\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
const AIRTABLE_ID_RE = /^rec[A-Za-z0-9]{10,}$/;

function stripDateSuffix(s: string): string {
  return s.replace(MONTH_RE, "").trim();
}

function isAirtableId(s: string): boolean {
  return AIRTABLE_ID_RE.test(s.trim());
}

function firstCleanValue(val: unknown): string {
  const raw = Array.isArray(val) ? String(val[0] ?? "") : String(val ?? "");
  return stripDateSuffix(raw.split(",")[0].trim());
}

/**
 * Extract the class title from raw Airtable data (client-side fallback).
 */
export function extractClassTitleFallback(raw: Record<string, unknown>): string {
  // Strategy 1: Masterclass Attendee Unique ID
  const uid = raw["Masterclass Attendee Unique ID"];
  if (uid && typeof uid === "string") {
    const segments = uid.split(" - ");
    if (segments.length >= 3) {
      const classAndDate = segments.slice(2).join(" - ").split(",")[0].trim();
      const title = stripDateSuffix(classAndDate);
      if (title && !isAirtableId(title)) return title;
    }
  }

  // Strategy 2: Known fields
  const fields = [
    "Registered For", "Class Name (from Class Record)",
    "Class Name", "Masterclass Name", "Class", "Course Name",
  ];
  for (const f of fields) {
    const val = raw[f];
    if (!val) continue;
    const cleaned = firstCleanValue(val);
    if (cleaned && !isAirtableId(cleaned)) return cleaned;
  }

  return "";
}

/**
 * Extract the project title from raw Airtable data (client-side fallback).
 */
export function extractProjectTitleFallback(
  raw: Record<string, unknown>,
  profileName?: string,
): string {
  const fields = [
    "Project Phase Name (from Project They Joined)",
    "Project They Joined", "Project Name", "Project",
  ];
  for (const f of fields) {
    const val = raw[f];
    if (!val) continue;
    const cleaned = firstCleanValue(val);
    if (!cleaned || isAirtableId(cleaned) || /@/.test(cleaned)) continue;
    if (profileName && cleaned.toLowerCase() === profileName.toLowerCase()) continue;
    return cleaned;
  }
  return "";
}

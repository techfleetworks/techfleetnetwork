/**
 * Shared title-extraction utilities for certification edge functions.
 * 
 * These run server-side at sync time so the DB always stores a clean,
 * pre-computed `display_title`. The UI never has to parse raw Airtable data.
 */

const MONTH_RE = /\s*-\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
const AIRTABLE_ID_RE = /^rec[A-Za-z0-9]{10,}$/;

/** Strip trailing " - Month YYYY" suffix from a string */
function stripDateSuffix(s: string): string {
  return s.replace(MONTH_RE, "").trim();
}

/** Check if a string is an Airtable record ID */
function isAirtableId(s: string): boolean {
  return AIRTABLE_ID_RE.test(s.trim());
}

/**
 * Extract a clean, single class/masterclass title from raw Airtable fields.
 *
 * Priority:
 *  1. `Masterclass Attendee Unique ID` — format: "1756 - Amanda Wolf - Service Leadership Masterclass - September 2025, ..."
 *     → Take the class-name segment (everything after person name, before first comma), strip date.
 *  2. First element of `Registered For` array (if not an Airtable record ID), strip date.
 *  3. Fallback: empty string.
 */
export function extractClassDisplayTitle(fields: Record<string, unknown>): string {
  // Strategy 1: Parse from Unique ID (most reliable)
  const uid = fields["Masterclass Attendee Unique ID"];
  if (uid && typeof uid === "string") {
    // Format: "1756 - Amanda Wolf - ClassName - Month Year, ClassName2 - Month Year"
    const segments = uid.split(" - ");
    if (segments.length >= 3) {
      // segments[0] = ID, segments[1] = Name, rest = class name + date
      const classAndDate = segments.slice(2).join(" - ").split(",")[0].trim();
      const title = stripDateSuffix(classAndDate);
      if (title && !isAirtableId(title)) return title;
    }
  }

  // Strategy 2: Registered For (first element)
  const regFor = fields["Registered For"];
  if (Array.isArray(regFor) && regFor.length > 0) {
    const first = String(regFor[0] ?? "").trim();
    if (first && !isAirtableId(first)) {
      return stripDateSuffix(first.split(",")[0].trim());
    }
  } else if (typeof regFor === "string" && regFor.trim()) {
    const cleaned = regFor.split(",")[0].trim();
    if (!isAirtableId(cleaned)) {
      return stripDateSuffix(cleaned);
    }
  }

  // Strategy 3: Other fallback fields
  const fallbackFields = [
    "Class Name (from Class Record)",
    "Class Name",
    "Masterclass Name",
    "Class",
    "Course Name",
  ];
  for (const f of fallbackFields) {
    const val = fields[f];
    if (!val) continue;
    const raw = Array.isArray(val) ? String(val[0] ?? "") : String(val);
    const cleaned = stripDateSuffix(raw.split(",")[0].trim());
    if (cleaned && !isAirtableId(cleaned)) return cleaned;
  }

  return "";
}

/**
 * Extract a clean project title from raw Airtable fields.
 *
 * Priority:
 *  1. `Project Phase Name (from Project They Joined)` — first element, strip date
 *  2. `Project They Joined` — first element (if resolved), strip date
 *  3. Fallback: empty string
 */
export function extractProjectDisplayTitle(
  fields: Record<string, unknown>,
  profileName?: string,
): string {
  const titleFields = [
    "Project Phase Name (from Project They Joined)",
    "Project They Joined",
    "Project Name",
    "Project",
  ];

  for (const f of titleFields) {
    const val = fields[f];
    if (!val) continue;
    const raw = Array.isArray(val) ? String(val[0] ?? "") : String(val);
    const cleaned = raw.split(",")[0].trim();
    if (!cleaned || isAirtableId(cleaned)) continue;
    // Skip if the "title" is just the user's name or an email
    if (/@/.test(cleaned)) continue;
    if (profileName && cleaned.toLowerCase() === profileName.toLowerCase()) continue;
    return stripDateSuffix(cleaned);
  }

  return "";
}

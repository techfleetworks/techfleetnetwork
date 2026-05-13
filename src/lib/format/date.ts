/**
 * Tech Fleet Brand Guide §6.5 — date / time formatting.
 *
 *  Dates: "January 15, 2026"      (no ordinals, no slashes)
 *  Times: "2:30 pm EST"           (12-hour, lowercase am/pm, tz when distributed)
 *  Range: "October 1 to October 5, 2026"
 *
 * Always use these helpers in user-facing copy. Internal logs / DB columns
 * may keep ISO 8601.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDate(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * 12-hour time, lowercase am/pm, optional timezone abbreviation.
 * Pass `tz` (e.g. "EST", "PST", "UTC") when the event is distributed across
 * timezones — per brand guide, omit only for local-only contexts.
 */
export function formatTime(
  input: Date | string | number,
  tz?: string
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  const mm = m.toString().padStart(2, "0");
  return tz ? `${h}:${mm} ${ampm} ${tz}` : `${h}:${mm} ${ampm}`;
}

export function formatDateTime(
  input: Date | string | number,
  tz?: string
): string {
  const date = formatDate(input);
  const time = formatTime(input, tz);
  return date && time ? `${date} at ${time}` : date || time;
}

/**
 * "October 1 to October 5, 2026" — collapses month/year when shared.
 */
export function formatDateRange(
  start: Date | string | number,
  end: Date | string | number
): string {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()} to ${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()} to ${MONTHS[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${formatDate(s)} to ${formatDate(e)}`;
}

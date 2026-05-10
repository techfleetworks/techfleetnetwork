/**
 * Format event time helpers — all timezone-aware.
 */

function tzAbbr(d: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(d);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export function formatEventTime(
  startUtc: string,
  endUtc: string,
  timeZone: string,
  allDay: boolean,
): { primary: string; relative: string; iso: string } {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  const tz = timeZone || "UTC";

  const datePart = (d: Date) =>
    new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(d);

  const timePart = (d: Date) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(d);

  const abbr = tzAbbr(start, tz);

  let primary: string;
  if (allDay) {
    primary = `All day · ${datePart(start)}`;
  } else {
    const sameDay = datePart(start) === datePart(end);
    primary = sameDay
      ? `${datePart(start)} · ${timePart(start)} – ${timePart(end)}${abbr ? ` ${abbr}` : ""}`
      : `${datePart(start)} ${timePart(start)} ${abbr} → ${datePart(end)} ${timePart(end)} ${abbr}`.trim();
  }

  const now = Date.now();
  const diffMs = start.getTime() - now;
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  let relative = "";
  if (start.getTime() <= now && end.getTime() >= now) relative = "Happening now";
  else if (diffDays === 0) relative = "Today";
  else if (diffDays === 1) relative = "Tomorrow";
  else if (diffDays > 1 && diffDays < 7) relative = `In ${diffDays} days`;
  else if (diffDays >= 7 && diffDays < 14) relative = "Next week";

  return { primary, relative, iso: start.toISOString() };
}

/** "2:00 – 3:00 PM EST" — used inside calendar blocks and dialog. */
export function formatTimeRangeWithZone(
  startUtc: string,
  endUtc: string,
  timeZone: string,
): string {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  const tz = timeZone || "UTC";
  const t = (d: Date) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(d);
  const abbr = tzAbbr(start, tz);
  return `${t(start)} – ${t(end)}${abbr ? ` ${abbr}` : ""}`;
}

export function getTimezoneAbbreviation(timeZone: string, ref: Date = new Date()): string {
  return tzAbbr(ref, timeZone || "UTC");
}

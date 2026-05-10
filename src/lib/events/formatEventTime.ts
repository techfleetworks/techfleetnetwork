/**
 * Format an event's start/end window in the viewer's timezone.
 *
 * - Same day: "Wed, May 14 · 6:00 – 7:30 PM EDT"
 * - Multi-day: "Wed, May 14 6:00 PM EDT → Thu, May 15 7:30 AM EDT"
 * - All day:   "All day · Wed, May 14"
 */
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

  const timePart = (d: Date, includeTz: boolean) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      timeZoneName: includeTz ? "short" : undefined,
    }).format(d);

  let primary: string;
  if (allDay) {
    primary = `All day · ${datePart(start)}`;
  } else {
    const sameDay =
      datePart(start) === datePart(end);
    primary = sameDay
      ? `${datePart(start)} · ${timePart(start, false)} – ${timePart(end, true)}`
      : `${datePart(start)} ${timePart(start, true)} → ${datePart(end)} ${timePart(end, true)}`;
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

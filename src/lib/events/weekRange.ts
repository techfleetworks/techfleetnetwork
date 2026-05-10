import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Compute Monday 00:00 of the week containing `ref` *in the given timezone*,
 * then return UTC ISO strings for the [Mon 00:00, next Mon 00:00) window.
 */
export function getWeekRange(ref: Date, timeZone: string): { start: Date; end: Date } {
  const tz = timeZone || "UTC";
  // Get Y/M/D + weekday in the target tz
  const ymd = formatInTimeZone(ref, tz, "yyyy-MM-dd");
  const dayName = formatInTimeZone(ref, tz, "EEE"); // Mon, Tue ...
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[dayName] ?? 0;
  // Build local-midnight then shift back to Monday
  const localMidnight = fromZonedTime(`${ymd}T00:00:00`, tz);
  const monday = new Date(localMidnight.getTime() - offset * 24 * 60 * 60 * 1000);
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start: monday, end: nextMonday };
}

export function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

export function formatWeekLabel(start: Date, timeZone: string): string {
  const tz = timeZone || "UTC";
  const endInclusive = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const sameMonth = formatInTimeZone(start, tz, "MMM") === formatInTimeZone(endInclusive, tz, "MMM");
  const sameYear = formatInTimeZone(start, tz, "yyyy") === formatInTimeZone(endInclusive, tz, "yyyy");
  if (sameMonth) {
    return `${formatInTimeZone(start, tz, "MMM d")} – ${formatInTimeZone(endInclusive, tz, "d, yyyy")}`;
  }
  if (sameYear) {
    return `${formatInTimeZone(start, tz, "MMM d")} – ${formatInTimeZone(endInclusive, tz, "MMM d, yyyy")}`;
  }
  return `${formatInTimeZone(start, tz, "MMM d, yyyy")} – ${formatInTimeZone(endInclusive, tz, "MMM d, yyyy")}`;
}

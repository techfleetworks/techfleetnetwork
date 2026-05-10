/**
 * Build a Google Calendar "Add event" template URL for a single event.
 * Opens https://calendar.google.com/calendar/render?action=TEMPLATE&...
 * which lets the viewer add this event to *their own* calendar.
 */
export interface EventLike {
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  description?: string;
  location?: string;
  url?: string;
}

function toGCalDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }
  // YYYYMMDDTHHmmssZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildGoogleCalendarTemplateUrl(ev: EventLike): string {
  const dates = `${toGCalDate(ev.startUtc, ev.allDay)}/${toGCalDate(ev.endUtc, ev.allDay)}`;
  const detailsParts: string[] = [];
  if (ev.description) detailsParts.push(ev.description);
  if (ev.url) detailsParts.push(`Link: ${ev.url}`);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
  });
  if (detailsParts.length) params.set("details", detailsParts.join("\n\n"));
  if (ev.location) params.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

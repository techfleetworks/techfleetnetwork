import { CalendarPlus, Copy, ExternalLink, Mail, MapPin, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/security";
import { linkifyHtml } from "@/lib/linkify";
import { formatEventTime } from "@/lib/events/formatEventTime";
import { buildGoogleCalendarTemplateUrl } from "@/lib/events/googleCalendarTemplate";
import type { CommunityEvent } from "./CommunityEventCard";

interface Props {
  event: CommunityEvent | null;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/i;
function extractMeetingUrl(ev: CommunityEvent): string | null {
  if (ev.url && URL_RE.test(ev.url)) return ev.url.match(URL_RE)![0];
  if (ev.location && URL_RE.test(ev.location)) return ev.location.match(URL_RE)![0];
  if (ev.description && URL_RE.test(ev.description)) return ev.description.match(URL_RE)![0];
  return null;
}

export function EventDetailDialog({ event, timeZone, open, onOpenChange }: Props) {
  if (!event) return null;
  const time = formatEventTime(event.startUtc, event.endUtc, timeZone, event.allDay);
  const addUrl = buildGoogleCalendarTemplateUrl(event);
  const meetingUrl = extractMeetingUrl(event);
  const isVideoLink =
    meetingUrl && /(meet\.google|zoom\.us|teams\.microsoft|whereby|webex)/i.test(meetingUrl);
  const descriptionHtml = event.description
    ? sanitizeHtml(linkifyHtml(event.description))
    : "";

  const copyLink = async () => {
    if (!meetingUrl) return;
    try {
      await navigator.clipboard.writeText(meetingUrl);
      toast({ title: "Link copied", description: "Event link copied to your clipboard." });
    } catch {
      toast({ title: "Copy failed", description: meetingUrl, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">{event.title}</DialogTitle>
          <DialogDescription className="text-left">
            <time dateTime={time.iso}>{time.primary}</time>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {event.location && !URL_RE.test(event.location) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="break-words">{event.location}</span>
            </div>
          )}
          {event.organizerEmail && (
            <div className="flex items-start gap-2 text-sm">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a
                href={`mailto:${event.organizerEmail}`}
                className="text-primary hover:underline break-all"
              >
                {event.organizerEmail}
              </a>
            </div>
          )}
          {event.url && (
            <div className="flex items-start gap-2 text-sm">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {event.url}
              </a>
            </div>
          )}
          {descriptionHtml && (
            <div
              className="prose prose-sm max-w-none text-sm text-foreground/90 [&_a]:text-primary [&_a]:underline whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button asChild size="sm" variant="default">
            <a
              href={addUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Add ${event.title} to your Google Calendar`}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Add to Google Calendar
            </a>
          </Button>
          {meetingUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                {isVideoLink ? (
                  <Video className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                )}
                {isVideoLink ? "Join meeting" : "Open link"}
              </a>
            </Button>
          )}
          {meetingUrl && (
            <Button size="sm" variant="ghost" onClick={copyLink}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

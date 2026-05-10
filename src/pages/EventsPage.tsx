import { useEffect, useState } from "react";
import { CalendarPlus, Copy, Globe, Link2, List as ListIcon, CalendarDays, Users } from "lucide-react";
import { ResponsiveTabs, ResponsiveTabsList, ResponsiveTabsContent, type TabItem } from "@/components/ui/responsive-tabs";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { CommunityEventList } from "@/components/events/CommunityEventList";
import { WeekCalendar } from "@/components/events/WeekCalendar";
import { TimezoneSelector } from "@/components/events/TimezoneSelector";

const TF_CALENDAR_EMAIL = "techfleetnetwork@gmail.com";
const ADD_TO_GOOGLE_URL = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(TF_CALENDAR_EMAIL)}`;
const ICAL_SUBSCRIBE_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(TF_CALENDAR_EMAIL)}/public/basic.ics`;
const OPEN_IN_GOOGLE_URL = `https://calendar.google.com/calendar/u/0/embed?src=${encodeURIComponent(TF_CALENDAR_EMAIL)}`;

const eventTabs: TabItem[] = [
  { value: "community", label: "Community Events", icon: <Users className="h-4 w-4" /> },
  { value: "public", label: "Public Events", icon: <Globe className="h-4 w-4" /> },
];

const TZ_KEY = "tfn.events.tz";
const VIEW_KEY = "tfn.events.view";

export default function EventsPage() {
  const [tab, setTab] = useState("community");
  const { profile } = useAuth();

  // Timezone precedence: localStorage → profile → browser → America/New_York (EDT fallback).
  const [timeZone, setTimeZone] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(TZ_KEY);
      if (saved) return saved;
    }
    return (
      profile?.timezone?.trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "America/New_York"
    );
  });

  // If profile loads after mount and user hasn't picked one, adopt profile tz.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TZ_KEY)) return;
    if (profile?.timezone?.trim()) setTimeZone(profile.timezone.trim());
  }, [profile?.timezone]);

  const handleTzChange = (tz: string) => {
    setTimeZone(tz);
    try {
      window.localStorage.setItem(TZ_KEY, tz);
    } catch {
      /* ignore */
    }
  };

  const [view, setView] = useState<"week" | "list">(() => {
    if (typeof window === "undefined") return "week";
    return (window.localStorage.getItem(VIEW_KEY) as "week" | "list") || "week";
  });
  const handleViewChange = (v: string) => {
    if (v !== "week" && v !== "list") return;
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const lumaSrc = "https://luma.com/tech-fleet-network";

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Events</h1>
        <p className="text-muted-foreground mt-1">
          Upcoming project meetings and community events across Tech Fleet.
        </p>
      </div>

      <ResponsiveTabs value={tab} onValueChange={setTab} className="w-full">
        <ResponsiveTabsList tabs={eventTabs} value={tab} onValueChange={setTab} className="mb-6" />

        <ResponsiveTabsContent value="public">
          <div className="overflow-hidden rounded-lg bg-card">
            <iframe
              src="https://luma.com/embed/calendar/cal-Iy1vN2k9O1VcEBC/events"
              title="Tech Fleet Network Events – Luma"
              width="100%"
              height="600"
              frameBorder="0"
              className="w-full"
              style={{
                height: "100dvh",
                minHeight: "480px",
                border: "1px solid hsl(var(--border) / 0.55)",
                borderRadius: "4px",
              }}
              loading="lazy"
              allowFullScreen
            />
            <div className="border-x border-b p-3 text-center text-sm text-muted-foreground">
              Not seeing events?{" "}
              <a
                href={lumaSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open the calendar on Luma →
              </a>
            </div>
          </div>
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="community">
          <div className="mb-4 rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Subscribe to all Tech Fleet events</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add the whole calendar once and new events appear automatically in Google, Apple, or Outlook.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="default">
                  <a href={ADD_TO_GOOGLE_URL} target="_blank" rel="noopener noreferrer">
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Subscribe in Google
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(ICAL_SUBSCRIBE_URL);
                      toast({ title: "iCal link copied", description: "Paste it into Apple Calendar or Outlook to subscribe." });
                    } catch {
                      toast({ title: "Copy failed", description: ICAL_SUBSCRIBE_URL, variant: "destructive" });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy iCal link
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={OPEN_IN_GOOGLE_URL} target="_blank" rel="noopener noreferrer">
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Open in Google
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && handleViewChange(v)}
              aria-label="Select view"
              className="border rounded-md"
            >
              <ToggleGroupItem value="week" aria-label="Week view" className="h-8 px-3 text-xs">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Week
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view" className="h-8 px-3 text-xs">
                <ListIcon className="h-4 w-4" aria-hidden="true" />
                List
              </ToggleGroupItem>
            </ToggleGroup>

            <TimezoneSelector value={timeZone} onChange={handleTzChange} />
          </div>

          {view === "week" ? (
            <WeekCalendar timeZone={timeZone} fallbackUrl={OPEN_IN_GOOGLE_URL} />
          ) : (
            <CommunityEventList timeZone={timeZone} fallbackUrl={OPEN_IN_GOOGLE_URL} />
          )}
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}

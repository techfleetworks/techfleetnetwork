import { useState, useMemo } from "react";
import { Globe, Users } from "lucide-react";
import { ResponsiveTabs, ResponsiveTabsList, ResponsiveTabsContent, type TabItem } from "@/components/ui/responsive-tabs";
import { useAuth } from "@/contexts/AuthContext";

const eventTabs: TabItem[] = [
  { value: "community", label: "Community Events", icon: <Users className="h-4 w-4" /> },
  { value: "public", label: "Public Events", icon: <Globe className="h-4 w-4" /> },
];

export default function EventsPage() {
  const [tab, setTab] = useState("community");
  const { profile } = useAuth();

  // Always render in the member's profile timezone; fall back to EDT (America/New_York) if unset.
  const userTimezone = profile?.timezone?.trim() || "America/New_York";

  const lumaSrc = "https://luma.com/tech-fleet-network";
  const calendarSrc = useMemo(
    () =>
      `https://calendar.google.com/calendar/embed?src=techfleetnetwork%40gmail.com&ctz=${encodeURIComponent(userTimezone)}&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0&showTz=1&mode=MONTH`,
    [userTimezone]
  );
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
              aria-hidden="false"
              tabIndex={0}
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
          <div className="rounded-lg border bg-card overflow-hidden">
            <iframe
              src={calendarSrc}
              title="Tech Fleet Community Calendar"
              className="w-full border-0"
              style={{ minHeight: "680px" }}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}

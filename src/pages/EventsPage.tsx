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

  const userTimezone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const lumaSrc =
    "https://lu.ma/embed/community/comm-xiKNSR1G2cMEJBk/events?compact=true&lt=light";
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
          <div className="rounded-lg border bg-card overflow-hidden">
            <iframe
              src={lumaSrc}
              title="Tech Fleet Public Events – Luma"
              className="w-full border-0"
              style={{ minHeight: "600px" }}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
              allowFullScreen
            />
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

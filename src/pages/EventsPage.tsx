export default function EventsPage() {
  const lumaSrc =
    "https://lu.ma/embed/community/comm-xiKNSR1G2cMEJBk/events?compact=true&lt=light";
  const calendarSrc =
    "https://calendar.google.com/calendar/embed?src=techfleetnetwork%40gmail.com&ctz=America%2FNew_York&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0&showTz=1&mode=MONTH";

  return (
    <div className="container-app py-8 sm:py-12 space-y-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Events
        </h1>
        <p className="text-muted-foreground mt-1">
          Upcoming project meetings and community events across Tech Fleet.
        </p>
      </div>

      {/* Public Events */}
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Public Events
        </h2>
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
      </section>

      {/* Community Events */}
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Community Events
        </h2>
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
      </section>
    </div>
  );
}

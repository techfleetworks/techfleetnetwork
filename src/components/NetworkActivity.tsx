import { memo, lazy, Suspense } from "react";
import { Users, BookOpen, Award, FileCheck, CalendarDays, UserPlus, Briefcase, Rocket, PlayCircle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@/lib/react-query";
import { StatsService, type NetworkStats } from "@/services/stats.service";
import { Skeleton } from "@/components/ui/skeleton";

const MemberWorldMap = lazy(() =>
  import("@/components/MemberWorldMap").then((m) => ({ default: m.MemberWorldMap }))
);

const defaultStats: NetworkStats = {
  total_signups: 0,
  core_courses_active: 0,
  beginner_courses_active: 0,
  advanced_courses_active: 0,
  applications_completed: 0,
  badges_earned: 0,
  prev_week_start: "",
  prev_week_end: "",
  prev_week_signups: 0,
  prev_week_core_active: 0,
  prev_week_beginner_active: 0,
  prev_week_advanced_active: 0,
  prev_week_applications: 0,
  prev_week_badges: 0,
  projects_open_applications: 0,
  projects_coming_soon: 0,
  projects_live: 0,
  projects_previously_completed: 0,
};

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  colorClass: string;
}

const StatCard = memo(function StatCard({ icon, value, label, colorClass }: StatCardProps) {
  return (
    <div className="card-elevated p-5 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
});

function parseStatsDate(value: string): Date | null {
  if (!value) return null;

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseStatsDate(start);
  const endDate = parseStatsDate(end);

  if (!startDate || !endDate) return "";

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(startDate)} – ${formatter.format(endDate)}, ${endDate.getUTCFullYear()}`;
}

function MapFallback() {
  return <Skeleton className="w-full h-[400px] rounded-lg" />;
}

interface NetworkActivityProps {
  showMap?: boolean;
  showActivity?: boolean;
}

export const NetworkActivity = memo(function NetworkActivity({ showMap = true, showActivity = true }: NetworkActivityProps) {
  const { data: stats = defaultStats, isLoading: loading } = useQuery({
    queryKey: ["network-stats"],
    queryFn: () => StatsService.getNetworkStats(),
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
  });

  if (loading) {
    return (
      <section aria-labelledby="network-activity-heading" className="py-12 sm:py-16" style={{ minHeight: 800 }}>
        <div className="container-app">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="network-activity-heading" className="py-12 sm:py-16">
      <div className="container-app">
        <div className="mb-8">
          <h2 id="network-activity-heading" className="text-xl font-semibold text-foreground">
            Network Activity
          </h2>
          <p className="text-muted-foreground mt-2">
            See what our community members are working on right now
          </p>
        </div>

        {showActivity && (
          <>
            <h3 className="text-lg font-semibold text-foreground mb-3">All Time</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              <StatCard icon={<UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />} value={stats.total_signups} label="New Sign-ups" colorClass="bg-primary/10" />
              <StatCard icon={<BookOpen className="h-5 w-5 text-warning" aria-hidden="true" />} value={stats.core_courses_active} label="Completed Core Courses" colorClass="bg-warning/10" />
              <StatCard icon={<BookOpen className="h-5 w-5 text-info" aria-hidden="true" />} value={stats.beginner_courses_active} label="Completed Beginner Courses" colorClass="bg-info/10" />
              <StatCard icon={<BookOpen className="h-5 w-5 text-accent-foreground" aria-hidden="true" />} value={stats.advanced_courses_active} label="Completed Advanced Courses" colorClass="bg-accent/50" />
              <StatCard icon={<FileCheck className="h-5 w-5 text-success" aria-hidden="true" />} value={stats.applications_completed} label="General Applications Completed" colorClass="bg-success/10" />
              <StatCard icon={<Award className="h-5 w-5 text-primary" aria-hidden="true" />} value={stats.badges_earned} label="Badges Earned" colorClass="bg-primary/10" />
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Project Training</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatCard icon={<Briefcase className="h-5 w-5 text-success" aria-hidden="true" />} value={stats.projects_open_applications} label="Open Applications" colorClass="bg-success/10" />
              <StatCard icon={<Rocket className="h-5 w-5 text-warning" aria-hidden="true" />} value={stats.projects_coming_soon} label="Coming Soon" colorClass="bg-warning/10" />
              <StatCard icon={<PlayCircle className="h-5 w-5 text-primary" aria-hidden="true" />} value={stats.projects_live} label="Live" colorClass="bg-primary/10" />
              <StatCard icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />} value={stats.projects_previously_completed} label="Previously Completed" colorClass="bg-muted" />
            </div>

            <div className="border-t pt-8">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-foreground">Past 7 Days</h3>
              </div>
              {stats.prev_week_start && stats.prev_week_end && (
                <p className="text-sm text-muted-foreground mb-4">
                  {formatDateRange(stats.prev_week_start, stats.prev_week_end)}
                </p>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard icon={<UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />} value={stats.prev_week_signups} label="New Sign-ups" colorClass="bg-primary/10" />
                <StatCard icon={<BookOpen className="h-5 w-5 text-warning" aria-hidden="true" />} value={stats.prev_week_core_active} label="Completed Core Courses" colorClass="bg-warning/10" />
                <StatCard icon={<BookOpen className="h-5 w-5 text-info" aria-hidden="true" />} value={stats.prev_week_beginner_active} label="Completed Beginner Courses" colorClass="bg-info/10" />
                <StatCard icon={<BookOpen className="h-5 w-5 text-accent-foreground" aria-hidden="true" />} value={stats.prev_week_advanced_active} label="Completed Advanced Courses" colorClass="bg-accent/50" />
                <StatCard icon={<FileCheck className="h-5 w-5 text-success" aria-hidden="true" />} value={stats.prev_week_applications} label="General Applications Completed" colorClass="bg-success/10" />
                <StatCard icon={<Award className="h-5 w-5 text-primary" aria-hidden="true" />} value={stats.prev_week_badges} label="Badges Earned" colorClass="bg-primary/10" />
              </div>
            </div>
          </>
        )}

        {showMap && (
          <div className={showActivity ? "border-t pt-8 mt-8" : ""}>
            <Suspense fallback={<MapFallback />}>
              <MemberWorldMap />
            </Suspense>
          </div>
        )}
      </div>
    </section>
  );
});

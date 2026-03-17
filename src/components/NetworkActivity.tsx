import { useEffect, useState } from "react";
import { Users, BookOpen, Award, FileCheck, CalendarDays, UserPlus } from "lucide-react";
import { StatsService, type NetworkStats } from "@/services/stats.service";
import { MemberWorldMap } from "@/components/MemberWorldMap";

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
};

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  colorClass: string;
}

function StatCard({ icon, value, label, colorClass }: StatCardProps) {
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
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "";
  const fmt = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const endDate = new Date(end + "T00:00:00");
  const year = endDate.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}

export function NetworkActivity() {
  const [stats, setStats] = useState<NetworkStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    StatsService.getNetworkStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section aria-labelledby="network-activity-heading" className="py-12 sm:py-16" style={{ minHeight: 600 }}>
        <div className="container-app">
          <div className="h-8 w-48 bg-muted rounded animate-pulse mb-8" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-elevated p-5 h-20 animate-pulse bg-muted/30" />
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

        {/* All Time Stats */}
        <h3 className="text-lg font-semibold text-foreground mb-3">All Time</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <StatCard
            icon={<UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />}
            value={stats.total_signups}
            label="New Sign-ups"
            colorClass="bg-primary/10"
          />
          <StatCard
            icon={<BookOpen className="h-5 w-5 text-warning" aria-hidden="true" />}
            value={stats.core_courses_active}
            label="Completed Core Courses"
            colorClass="bg-warning/10"
          />
          <StatCard
            icon={<BookOpen className="h-5 w-5 text-info" aria-hidden="true" />}
            value={stats.beginner_courses_active}
            label="Completed Beginner Courses"
            colorClass="bg-info/10"
          />
          <StatCard
            icon={<BookOpen className="h-5 w-5 text-accent-foreground" aria-hidden="true" />}
            value={stats.advanced_courses_active}
            label="Completed Advanced Courses"
            colorClass="bg-accent/50"
          />
          <StatCard
            icon={<FileCheck className="h-5 w-5 text-success" aria-hidden="true" />}
            value={stats.applications_completed}
            label="General Applications Completed"
            colorClass="bg-success/10"
          />
          <StatCard
            icon={<Award className="h-5 w-5 text-primary" aria-hidden="true" />}
            value={stats.badges_earned}
            label="Badges Earned"
            colorClass="bg-primary/10"
          />
        </div>

        {/* Previous Week */}
        <div className="border-t pt-8">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-foreground">Previous Week</h3>
          </div>
          {stats.prev_week_start && stats.prev_week_end && (
            <p className="text-sm text-muted-foreground mb-4">
              {formatDateRange(stats.prev_week_start, stats.prev_week_end)}
            </p>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              icon={<UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />}
              value={stats.prev_week_signups}
              label="New Sign-ups"
              colorClass="bg-primary/10"
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-warning" aria-hidden="true" />}
            value={stats.prev_week_core_active}
              label="Completed Core Courses"
              colorClass="bg-warning/10"
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-info" aria-hidden="true" />}
            value={stats.prev_week_beginner_active}
              label="Completed Beginner Courses"
              colorClass="bg-info/10"
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-accent-foreground" aria-hidden="true" />}
            value={stats.prev_week_advanced_active}
              label="Completed Advanced Courses"
              colorClass="bg-accent/50"
            />
            <StatCard
              icon={<FileCheck className="h-5 w-5 text-success" aria-hidden="true" />}
              value={stats.prev_week_applications}
              label="General Applications Completed"
              colorClass="bg-success/10"
            />
            <StatCard
              icon={<Award className="h-5 w-5 text-primary" aria-hidden="true" />}
              value={stats.prev_week_badges}
              label="Badges Earned"
              colorClass="bg-primary/10"
            />
          </div>
        </div>

        {/* World map */}
        <div className="border-t pt-8 mt-8">
          <MemberWorldMap />
        </div>
      </div>
    </section>
  );
}

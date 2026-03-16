import { useEffect, useState } from "react";
import { Users, UserCheck, Activity, CalendarDays, UserPlus } from "lucide-react";
import { StatsService, type NetworkStats } from "@/services/stats.service";
import { MemberWorldMap } from "@/components/MemberWorldMap";

const defaultStats: NetworkStats = {
  total_members: 0,
  first_steps_active: 0,
  first_steps_completed: 0,
  second_steps_active: 0,
  second_steps_completed: 0,
  third_steps_active: 0,
  third_steps_completed: 0,
  new_members_7d: 0,
  first_steps_active_7d: 0,
  first_steps_completed_7d: 0,
  second_steps_active_7d: 0,
  second_steps_completed_7d: 0,
  third_steps_active_7d: 0,
  third_steps_completed_7d: 0,
};

interface StepGroupProps {
  title: string;
  active: number;
  completed: number;
}

function StepGroup({ title, active, completed }: StepGroupProps) {
  return (
    <div className="card-elevated p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-warning/10 flex items-center justify-center flex-shrink-0">
            <Activity className="h-4 w-4 text-warning" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground leading-tight">{active}</p>
            <p className="text-xs text-muted-foreground">In progress</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-success/10 flex items-center justify-center flex-shrink-0">
            <UserCheck className="h-4 w-4 text-success" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground leading-tight">{completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
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
          <div className="h-8 w-48 bg-muted rounded animate-pulse mx-auto mb-8" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-elevated p-5 h-28 animate-pulse bg-muted/30" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="network-activity-heading" className="py-12 sm:py-16">
      <div className="container-app">
        <div className="text-center mb-8">
          <h2 id="network-activity-heading" className="text-3xl font-bold text-foreground">
            Network Activity
          </h2>
          <p className="text-muted-foreground mt-2">
            See what our community members are working on right now
          </p>
        </div>

        {/* Total members highlight */}
        <div className="flex justify-center mb-8">
          <div className="card-elevated px-6 py-4 inline-flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total_members}</p>
              <p className="text-sm text-muted-foreground">Signed-up Members</p>
            </div>
          </div>
        </div>

        {/* All-time step groups */}
        <h3 className="text-lg font-semibold text-foreground mb-3">All Time</h3>
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <StepGroup title="Step 1 — Onboarding" active={stats.first_steps_active} completed={stats.first_steps_completed} />
          <StepGroup title="Step 2 — Agile Mindset" active={stats.second_steps_active} completed={stats.second_steps_completed} />
          <StepGroup title="Step 3 — Agile Teamwork" active={stats.third_steps_active} completed={stats.third_steps_completed} />
        </div>

        {/* Last 7 days */}
        <div className="border-t pt-8">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-foreground">Last 7 Days</h3>
          </div>

          <div className="flex justify-start mb-4">
            <div className="card-elevated px-5 py-3 inline-flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground leading-tight">{stats.new_members_7d}</p>
                <p className="text-xs text-muted-foreground">New sign-ups</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <StepGroup title="Step 1 — Onboarding" active={stats.first_steps_active_7d} completed={stats.first_steps_completed_7d} />
            <StepGroup title="Step 2 — Agile Mindset" active={stats.second_steps_active_7d} completed={stats.second_steps_completed_7d} />
            <StepGroup title="Step 3 — Agile Teamwork" active={stats.third_steps_active_7d} completed={stats.third_steps_completed_7d} />
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

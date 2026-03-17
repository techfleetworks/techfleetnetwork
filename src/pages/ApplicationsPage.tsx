import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, FolderKanban, HeartHandshake, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { GeneralApplicationService } from "@/services/general-application.service";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ApplicationsPage() {
  const { user } = useAuth();
  const [appStatus, setAppStatus] = useState<{ completed: boolean; completedAt: string | null }>({ completed: false, completedAt: null });

  useEffect(() => {
    if (!user) return;
    GeneralApplicationService.list(user.id).then((apps) => {
      if (apps.length > 0 && apps[0].status === "completed") {
        setAppStatus({ completed: true, completedAt: ((apps[0] as unknown as Record<string, unknown>).completed_at as string | null) ?? apps[0].updated_at });
      }
    }).catch(() => {});
  }, [user]);

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Applications
        </h1>
        <p className="text-muted-foreground mt-1">
          Apply to join project teams, volunteer teams, or submit your general
          application.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* General Application Card */}
        <Link
          to="/applications/general"
          className="group rounded-lg border bg-card p-6 hover:shadow-md transition-shadow duration-200 flex flex-col relative"
        >
          {appStatus.completed && (
            <Badge className="absolute top-4 right-4 bg-success/10 text-success border-success/30 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </Badge>
          )}
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            General Application
          </h2>
          <p className="text-sm text-muted-foreground flex-1">
            Submit your general application to join the Tech Fleet community.
            Covers your background, agile mindset, and service leadership.
          </p>
          {appStatus.completed && appStatus.completedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Completed on {format(new Date(appStatus.completedAt), "MMM d, yyyy")}
            </p>
          )}
          <div className="flex items-center gap-1 mt-4 text-sm font-medium text-primary group-hover:gap-2 transition-all">
            {appStatus.completed ? "View & Edit" : "Open"}
            <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        {/* Project Applications Card */}
        <div className="rounded-lg border bg-card p-6 flex flex-col">
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
            <FolderKanban className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Project Applications
          </h2>
          <p className="text-sm text-muted-foreground flex-1">
            Browse and apply to active project teams. Each project has its own
            application requirements and timeline.
          </p>
          <span className="mt-4 text-sm text-muted-foreground italic">Coming soon</span>
        </div>

        {/* Volunteer Applications Card */}
        <div className="rounded-lg border bg-card p-6 flex flex-col">
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
            <HeartHandshake className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Volunteer Applications
          </h2>
          <p className="text-sm text-muted-foreground flex-1">
            Apply to volunteer teams that support Tech Fleet operations,
            mentorship, and community initiatives.
          </p>
          <span className="mt-4 text-sm text-muted-foreground italic">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

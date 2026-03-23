import { lazy, Suspense } from "react";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert, Target } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/contexts/AuthContext";

const ApplicationAnalysisPage = lazy(() =>
  import("@/pages/ApplicationAnalysisPage").then((m) => ({ default: m.default }))
);

const RecruitingRosterTab = lazy(() =>
  import("@/components/admin/RecruitingRosterTab").then((m) => ({ default: m.default }))
);

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function AdminRosterPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();

  const { data: activeProjectCount = 0 } = useQuery({
    queryKey: ["recruiting-active-project-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("project_status", "apply_now");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && isAdmin,
  });

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground font-medium">Access denied. Admin role required.</p>
      </div>
    );
  }

  return (
    <div className="container-app py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" aria-hidden="true" />
          Recruiting Center
        </h1>
        <p className="text-muted-foreground mt-1">
          Analyze applicants and manage project team rosters.
        </p>
      </div>

      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis" className="gap-1.5">
            Application Analysis
            {activeProjectCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-5 min-w-[20px] flex items-center justify-center">
                {activeProjectCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="roster">Project Roster</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <ApplicationAnalysisPage />
          </Suspense>
        </TabsContent>

        <TabsContent value="roster" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <RecruitingRosterTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

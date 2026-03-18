import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DashboardWidgetId =
  | "core_courses"
  | "world_map"
  | "network_activity"
  | "latest_updates"
  | "my_project_apps"
  | "badges";

export const ALL_WIDGETS: { id: DashboardWidgetId; label: string }[] = [
  { id: "core_courses", label: "Core Courses" },
  { id: "world_map", label: "Tech Fleet Network Map" },
  { id: "network_activity", label: "Tech Fleet Network Activity" },
  { id: "latest_updates", label: "Latest Updates" },
  { id: "my_project_apps", label: "My Project Applications" },
  { id: "badges", label: "Beginner Badges Earned" },
];

const DEFAULT_WIDGETS: DashboardWidgetId[] = ["core_courses", "latest_updates"];

export function useDashboardPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["dashboard-preferences", user?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: row } = await supabase
        .from("dashboard_preferences")
        .select("visible_widgets")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!row) return { widgets: DEFAULT_WIDGETS, isNew: true };
      return { widgets: (row.visible_widgets as DashboardWidgetId[]) ?? DEFAULT_WIDGETS, isNew: false };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (widgets: DashboardWidgetId[]) => {
      const { error } = await supabase
        .from("dashboard_preferences")
        .upsert(
          [{ user_id: user!.id, visible_widgets: widgets as unknown as import("@/integrations/supabase/types").Json }],
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onMutate: async (widgets) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData(queryKey);
      qc.setQueryData(queryKey, { widgets, isNew: false });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const visibleWidgets = data?.widgets ?? DEFAULT_WIDGETS;
  const isNewUser = data?.isNew ?? true;

  const isVisible = (id: DashboardWidgetId) => visibleWidgets.includes(id);
  const setWidgets = (widgets: DashboardWidgetId[]) => mutation.mutate(widgets);
  const toggleWidget = (id: DashboardWidgetId) => {
    const next = isVisible(id)
      ? visibleWidgets.filter((w) => w !== id)
      : [...visibleWidgets, id];
    setWidgets(next);
  };

  return { visibleWidgets, isVisible, setWidgets, toggleWidget, isNewUser, isLoading };
}

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

/** Default order for all widget IDs */
const DEFAULT_ORDER: DashboardWidgetId[] = ALL_WIDGETS.map((w) => w.id);

/** Default visible widgets for brand-new users */
const DEFAULT_VISIBLE: DashboardWidgetId[] = ["core_courses", "latest_updates"];

interface Prefs {
  visibleWidgets: DashboardWidgetId[];
  widgetOrder: DashboardWidgetId[];
  isNew: boolean;
}

export function useDashboardPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["dashboard-preferences", user?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Prefs> => {
      const { data: row } = await supabase
        .from("dashboard_preferences")
        .select("visible_widgets, widget_order")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!row) return { visibleWidgets: DEFAULT_VISIBLE, widgetOrder: DEFAULT_ORDER, isNew: true };

      const visible = Array.isArray(row.visible_widgets) ? (row.visible_widgets as DashboardWidgetId[]) : DEFAULT_VISIBLE;
      let order = Array.isArray(row.widget_order) ? (row.widget_order as DashboardWidgetId[]) : DEFAULT_ORDER;

      // Ensure all known widget IDs are present in the order array
      const missing = DEFAULT_ORDER.filter((id) => !order.includes(id));
      if (missing.length > 0) order = [...order, ...missing];

      return { visibleWidgets: visible, widgetOrder: order, isNew: false };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (prefs: { visibleWidgets: DashboardWidgetId[]; widgetOrder: DashboardWidgetId[] }) => {
      const { error } = await supabase
        .from("dashboard_preferences")
        .upsert(
          [{
            user_id: user!.id,
            visible_widgets: prefs.visibleWidgets as unknown as import("@/integrations/supabase/types").Json,
            widget_order: prefs.widgetOrder as unknown as import("@/integrations/supabase/types").Json,
          }],
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData(queryKey);
      qc.setQueryData(queryKey, { ...prefs, isNew: false });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const visibleWidgets = data?.visibleWidgets ?? DEFAULT_VISIBLE;
  const widgetOrder = data?.widgetOrder ?? DEFAULT_ORDER;
  const isNewUser = data?.isNew ?? true;

  const persist = (visible: DashboardWidgetId[], order: DashboardWidgetId[]) =>
    mutation.mutate({ visibleWidgets: visible, widgetOrder: order });

  const isVisible = (id: DashboardWidgetId) => visibleWidgets.includes(id);

  const setWidgets = (widgets: DashboardWidgetId[]) => persist(widgets, widgetOrder);

  const toggleWidget = (id: DashboardWidgetId) => {
    const next = isVisible(id)
      ? visibleWidgets.filter((w) => w !== id)
      : [...visibleWidgets, id];
    persist(next, widgetOrder);
  };

  const reorderWidgets = (order: DashboardWidgetId[]) => persist(visibleWidgets, order);

  return { visibleWidgets, widgetOrder, isVisible, setWidgets, toggleWidget, reorderWidgets, isNewUser, isLoading };
}

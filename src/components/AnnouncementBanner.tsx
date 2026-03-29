/**
 * AnnouncementBanner
 *
 * Full-width, dismissible banner shown at the top of the authenticated layout.
 * Dismissal is persisted server-side (dashboard_preferences) so it stays
 * dismissed across browsers/devices and logins.
 *
 * Accessibility: role="status", aria-live, close button with label.
 */

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@/lib/react-query";

export interface BannerConfig {
  /** Unique id — changing this resets dismissal state for all users */
  id: string;
  title: string;
  message: string;
}

/** Read dismissed banner IDs from dashboard_preferences JSON */
async function fetchDismissedBanners(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("dashboard_preferences")
    .select("visible_widgets")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.visible_widgets) return [];
  const widgets = data.visible_widgets as Record<string, unknown>;
  const dismissed = widgets?.dismissed_banners;
  return Array.isArray(dismissed) ? dismissed : [];
}

async function persistDismissal(userId: string, bannerId: string): Promise<void> {
  // Fetch current prefs
  const { data: existing } = await supabase
    .from("dashboard_preferences")
    .select("visible_widgets")
    .eq("user_id", userId)
    .maybeSingle();

  const currentWidgets = (existing?.visible_widgets as Record<string, unknown>) ?? {};
  const currentDismissed: string[] = Array.isArray(currentWidgets.dismissed_banners)
    ? currentWidgets.dismissed_banners
    : [];

  if (currentDismissed.includes(bannerId)) return;

  const updatedWidgets = {
    ...currentWidgets,
    dismissed_banners: [...currentDismissed, bannerId],
  };

  if (existing) {
    await supabase
      .from("dashboard_preferences")
      .update({ visible_widgets: updatedWidgets })
      .eq("user_id", userId);
  } else {
    await supabase
      .from("dashboard_preferences")
      .insert({ user_id: userId, visible_widgets: updatedWidgets, widget_order: [] });
  }
}

export function AnnouncementBanner({ id, title, message }: BannerConfig) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState(false);

  const { data: dismissedBanners = [], isLoading } = useQuery({
    queryKey: ["dismissed-banners", user?.id],
    queryFn: () => fetchDismissedBanners(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  const isDismissed = dismissedBanners.includes(id);

  const handleDismiss = useCallback(async () => {
    if (!user) return;
    setDismissing(true);
    try {
      await persistDismissal(user.id, id);
      queryClient.setQueryData(
        ["dismissed-banners", user.id],
        [...dismissedBanners, id],
      );
    } catch {
      /* degrade gracefully */
    }
    setDismissing(false);
  }, [id, user, dismissedBanners, queryClient]);

  if (!user || isLoading || isDismissed || dismissing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative w-full"
      style={{ backgroundColor: "hsl(220, 60%, 15%)", color: "hsl(0, 0%, 100%)" }}
    >
      <div className="flex items-start gap-3 px-4 py-3 sm:items-center sm:py-2.5 w-full">
        {/* Content */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line">
            {message}
          </p>
        </div>

        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 h-7 w-7 rounded-full text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/15 focus-visible:ring-primary-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

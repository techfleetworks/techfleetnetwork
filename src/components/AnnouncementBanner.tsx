/**
 * AnnouncementBanner
 *
 * Renders all published admin banners at the top of the authenticated layout.
 * Dismissals are tracked in the banner_dismissals table.
 * Banners with reopen_after_dismiss=true reappear on next page load.
 *
 * Accessibility: role="status", aria-live, close button with label.
 */

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@/lib/react-query";
import { sanitizeHtml } from "@/lib/security";
import {
  fetchPublishedBanners,
  fetchDismissedBannerIds,
  dismissBanner,
  type AdminBanner,
} from "@/services/banner.service";

function SingleBanner({
  banner,
  onDismiss,
}: {
  banner: AdminBanner;
  onDismiss: (id: string) => void;
}) {
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    await onDismiss(banner.id);
    setDismissing(false);
  }, [banner.id, onDismiss]);

  if (dismissing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative w-full"
      style={{ backgroundColor: "hsl(220, 60%, 15%)", color: "hsl(0, 0%, 100%)" }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-start gap-3 px-4 py-3 sm:items-center sm:py-2.5">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-semibold leading-snug break-words">{banner.title}</p>
          <div
            className="text-xs leading-relaxed opacity-90 prose prose-xs prose-invert max-w-none break-words [overflow-wrap:anywhere] [&_a]:text-blue-300 [&_a]:underline [&_*]:max-w-full"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(banner.body_html) }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          aria-label={`Dismiss ${banner.title}`}
          className="shrink-0 h-7 w-7 rounded-full text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/15 focus-visible:ring-primary-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AnnouncementBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: banners = [] } = useQuery({
    queryKey: ["published-banners"],
    queryFn: fetchPublishedBanners,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const { data: dismissedIds = [], isLoading } = useQuery({
    queryKey: ["banner-dismissals", user?.id],
    queryFn: () => fetchDismissedBannerIds(user!.id),
    enabled: !!user,
    staleTime: Infinity,
  });

  const handleDismiss = useCallback(
    async (bannerId: string) => {
      if (!user) return;
      try {
        await dismissBanner(bannerId, user.id);
        queryClient.setQueryData(
          ["banner-dismissals", user.id],
          [...dismissedIds, bannerId],
        );
      } catch {
        /* degrade gracefully */
      }
    },
    [user, dismissedIds, queryClient],
  );

  if (!user || isLoading) return null;

  // Filter: show banners not dismissed, OR banners with reopen_after_dismiss
  const visibleBanners = banners.filter(
    (b) => !dismissedIds.includes(b.id) || b.reopen_after_dismiss,
  );

  if (visibleBanners.length === 0) return null;

  return (
    <>
      {visibleBanners.map((banner) => (
        <SingleBanner key={banner.id} banner={banner} onDismiss={handleDismiss} />
      ))}
    </>
  );
}

/**
 * Announcement hooks — optimized for enterprise scale.
 *
 * Polling reduced from 30s → 60s base (240s when hidden).
 * staleTime raised to match poll cycle — saves ~50% of announcement DB calls.
 */
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { AnnouncementService } from "@/services/announcement.service";
import { useAuth } from "@/contexts/AuthContext";
import { useAdaptiveInterval } from "@/hooks/use-adaptive-interval";
import { queryKeys, CACHE_SEMI_STATIC } from "@/lib/query-config";

const ANNOUNCEMENTS_KEY = ["announcements"] as const;
const READ_IDS_KEY = ["announcement-read-ids"] as const;

export function useAnnouncements(limit = 50) {
  return useQuery({
    queryKey: queryKeys.announcements(limit),
    queryFn: () => AnnouncementService.list(limit),
    ...CACHE_SEMI_STATIC, // 15 min — announcements change very infrequently
  });
}

export function useLatestAnnouncements(limit = 5) {
  const interval = useAdaptiveInterval(60_000); // 60s base (was 30s), 240s hidden
  return useQuery({
    queryKey: queryKeys.announcementsLatest(limit),
    queryFn: () => AnnouncementService.latest(limit),
    refetchInterval: interval,
    staleTime: 45_000, // 45s — within a single poll cycle
  });
}

export function useAnnouncementReadIds() {
  const { user } = useAuth();
  const interval = useAdaptiveInterval(60_000); // 60s base (was 30s)
  return useQuery({
    queryKey: [...READ_IDS_KEY, user?.id],
    queryFn: () => AnnouncementService.getReadIds(user!.id),
    enabled: !!user,
    refetchInterval: interval,
    staleTime: 45_000,
  });
}

export function useMarkAnnouncementRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (announcementId: string) => {
      if (!user) throw new Error("Not authenticated");
      return AnnouncementService.markRead(user.id, announcementId);
    },
    onMutate: async (announcementId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: READ_IDS_KEY });
      queryClient.setQueryData<Set<string>>(
        [...READ_IDS_KEY, user?.id],
        (old) => new Set([...(old ?? []), announcementId])
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: READ_IDS_KEY });
    },
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, bodyHtml, userId, videoUrl, audioUrl }: { title: string; bodyHtml: string; userId: string; videoUrl?: string | null; audioUrl?: string | null }) => {
      const announcement = await AnnouncementService.create(title, bodyHtml, userId, videoUrl, audioUrl);
      // Fire-and-forget email notifications
      AnnouncementService.sendNotifications(announcement.id).catch(() => {});
      return announcement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => AnnouncementService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY });
    },
  });
}

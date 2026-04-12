/**
 * Announcement hooks — optimized for enterprise scale.
 *
 * Key changes:
 * - Shared useAdaptiveInterval (DRY)
 * - Added staleTime to prevent redundant refetches
 * - Optimistic updates on mark-read
 */
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { AnnouncementService, type Announcement } from "@/services/announcement.service";
import { useAuth } from "@/contexts/AuthContext";
import { useAdaptiveInterval } from "@/hooks/use-adaptive-interval";

const ANNOUNCEMENTS_KEY = ["announcements"] as const;
const READ_IDS_KEY = ["announcement-read-ids"] as const;

export function useAnnouncements(limit = 50) {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_KEY, limit],
    queryFn: () => AnnouncementService.list(limit),
    staleTime: 2 * 60 * 1000, // 2 min — announcements change infrequently
  });
}

export function useLatestAnnouncements(limit = 5) {
  const interval = useAdaptiveInterval(30_000);
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_KEY, "latest", limit],
    queryFn: () => AnnouncementService.latest(limit),
    refetchInterval: interval,
    staleTime: 15_000, // 15s — within a single poll cycle
  });
}

export function useAnnouncementReadIds() {
  const { user } = useAuth();
  const interval = useAdaptiveInterval(30_000);
  return useQuery({
    queryKey: [...READ_IDS_KEY, user?.id],
    queryFn: () => AnnouncementService.getReadIds(user!.id),
    enabled: !!user,
    refetchInterval: interval,
    staleTime: 15_000,
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

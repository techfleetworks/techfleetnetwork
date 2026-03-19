import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { AnnouncementService, type Announcement } from "@/services/announcement.service";
import { useAuth } from "@/contexts/AuthContext";

const ANNOUNCEMENTS_KEY = ["announcements"] as const;
const READ_IDS_KEY = ["announcement-read-ids"] as const;

export function useAnnouncements(limit = 50) {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_KEY, limit],
    queryFn: () => AnnouncementService.list(limit),
  });
}

export function useLatestAnnouncements(limit = 5) {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_KEY, "latest", limit],
    queryFn: () => AnnouncementService.latest(limit),
  });
}

export function useAnnouncementReadIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...READ_IDS_KEY, user?.id],
    queryFn: () => AnnouncementService.getReadIds(user!.id),
    enabled: !!user,
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

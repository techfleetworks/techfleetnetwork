import { useEffect, useRef } from "react";
import { useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Subscribes to realtime INSERT events on the announcements table.
 * Invalidates announcement queries and shows a toast for new announcements
 * created by other users.
 */
export function useAnnouncementRealtime() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useEffect(() => {
    const channel = supabase
      .channel("announcements-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "announcements",
        },
        (payload) => {
          // Invalidate all announcement queries so lists refresh automatically
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
          queryClient.invalidateQueries({ queryKey: ["announcement-read-ids"] });

          // Only toast if the announcement was created by someone else
          const createdBy = (payload.new as Record<string, unknown>)?.created_by;
          if (createdBy !== userIdRef.current) {
            const title = (payload.new as Record<string, unknown>)?.title;
            toast.info("New announcement", {
              description: typeof title === "string" ? title : "A new announcement has been posted.",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "announcements",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "announcements",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

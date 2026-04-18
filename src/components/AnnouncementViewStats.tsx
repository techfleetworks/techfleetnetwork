/**
 * AnnouncementViewStats
 *
 * Compact display of total + unique views for an announcement.
 * Visible to all authenticated users (counts are public within the platform).
 */
import { Eye, Users } from "lucide-react";
import { useAnnouncementViewCounts } from "@/hooks/use-announcements";

interface AnnouncementViewStatsProps {
  announcementId: string;
  className?: string;
  size?: "sm" | "md";
}

export function AnnouncementViewStats({
  announcementId,
  className = "",
  size = "sm",
}: AnnouncementViewStatsProps) {
  const { data: counts } = useAnnouncementViewCounts();
  const stats = counts?.get(announcementId) ?? { total: 0, unique: 0 };

  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div
      className={`inline-flex items-center gap-3 text-muted-foreground ${textSize} ${className}`}
      aria-label={`${stats.total} total views, ${stats.unique} unique viewers`}
    >
      <span className="inline-flex items-center gap-1" title="Total views">
        <Eye className={iconSize} aria-hidden="true" />
        <span>{stats.total.toLocaleString()}</span>
      </span>
      <span className="inline-flex items-center gap-1" title="Unique viewers">
        <Users className={iconSize} aria-hidden="true" />
        <span>{stats.unique.toLocaleString()}</span>
      </span>
    </div>
  );
}

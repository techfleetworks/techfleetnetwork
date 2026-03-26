/**
 * AnnouncementBanner
 *
 * Full-width, dismissible banner shown at the top of the authenticated layout.
 * Once dismissed, the banner ID is stored in localStorage so it never reappears
 * for that user/browser. Supports multiple banners over time by changing the id.
 *
 * Accessibility: role="status", aria-live, close button with label.
 */

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BannerConfig {
  /** Unique id — changing this resets dismissal state for all users */
  id: string;
  title: string;
  message: string;
}

const STORAGE_PREFIX = "tf_banner_dismissed_";

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function dismiss(id: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
  } catch {
    /* storage full — degrade gracefully */
  }
}

export function AnnouncementBanner({ id, title, message }: BannerConfig) {
  const [visible, setVisible] = useState(() => !isDismissed(id));

  const handleDismiss = useCallback(() => {
    dismiss(id);
    setVisible(false);
  }, [id]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative w-full bg-primary text-primary-foreground"
    >
      <div className="mx-auto flex items-start gap-3 px-4 py-3 sm:items-center sm:py-2.5 max-w-[1400px]">
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

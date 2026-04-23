import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientLogoProps {
  url?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ClientLogoProps["size"]>, string> = {
  xs: "h-6 w-6 rounded text-[10px]",
  sm: "h-8 w-8 rounded-md text-xs",
  md: "h-10 w-10 rounded-lg text-sm",
  lg: "h-14 w-14 rounded-lg text-base",
};

const ICON_SIZE: Record<NonNullable<ClientLogoProps["size"]>, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

function getInitials(name?: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shared client logo display: shows the uploaded logo image, or a neutral
 * fallback tile with initials (or a building icon when no name is available).
 */
export function ClientLogo({ url, name, size = "md", className }: ClientLogoProps) {
  const sizeCls = SIZE_CLASSES[size];
  const safeName = name?.trim() || "Client";

  if (url) {
    return (
      <img
        src={url}
        alt={`${safeName} logo`}
        loading="lazy"
        className={cn(
          sizeCls,
          "object-cover border border-border bg-background flex-shrink-0",
          className
        )}
      />
    );
  }

  const initials = getInitials(name);
  return (
    <div
      role="img"
      aria-label={`${safeName} logo placeholder`}
      className={cn(
        sizeCls,
        "bg-muted text-muted-foreground border border-border flex items-center justify-center font-semibold flex-shrink-0",
        className
      )}
    >
      {initials || <Building2 className={ICON_SIZE[size]} aria-hidden="true" />}
    </div>
  );
}

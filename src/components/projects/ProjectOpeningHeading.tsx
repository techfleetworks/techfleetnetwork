import { cn } from "@/lib/utils";
import type { ElementType } from "react";

/**
 * Two-line heading used everywhere a project opening surfaces:
 *   Line 1 — Client name (organization)
 *   Line 2 — Project friendly name (only if set)
 *
 * Centralised so future tweaks (typography, truncation, aria) propagate everywhere.
 */
interface ProjectOpeningHeadingProps {
  clientName: string | null | undefined;
  friendlyName: string | null | undefined;
  /** Visual size — controls clientName font size; friendly name auto-scales relative. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Render the client name as h1, h2, h3, p, or span. Defaults to <p>. */
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  className?: string;
  /** Truncate long names instead of wrapping (cards). */
  truncate?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ProjectOpeningHeadingProps["size"]>, { client: string; project: string }> = {
  sm: { client: "text-sm font-semibold", project: "text-xs" },
  md: { client: "text-base font-semibold", project: "text-sm" },
  lg: { client: "text-lg font-semibold leading-tight", project: "text-sm" },
  xl: { client: "text-2xl sm:text-3xl font-bold", project: "text-base sm:text-lg font-medium" },
};

export function ProjectOpeningHeading({
  clientName,
  friendlyName,
  size = "md",
  as = "p",
  className,
  truncate = false,
}: ProjectOpeningHeadingProps) {
  const safeClient = clientName?.trim() || "Project Opening";
  const friendly = friendlyName?.trim();
  const cls = SIZE_CLASSES[size];
  const Tag = as as ElementType;

  return (
    <div className={cn("min-w-0", className)}>
      <Tag className={cn(cls.client, "text-foreground", truncate && "truncate")}>
        {safeClient}
      </Tag>
      {friendly && (
        <p
          className={cn(cls.project, "text-muted-foreground mt-0.5", truncate && "truncate")}
          aria-label={`Project: ${friendly}`}
        >
          {friendly}
        </p>
      )}
    </div>
  );
}

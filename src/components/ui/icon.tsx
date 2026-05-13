import * as React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tech Fleet Brand Visual Guide §4 — canonical icon wrapper.
 *
 * Icons inherit currentColor and ship at 24px (UI default) or 16px (in-button
 * micro). lucide-react is our Feather-derived library; do not mix in other
 * icon sets. When standalone (no adjacent label) you MUST pass `label` so
 * screen readers announce the action; when paired with text, omit label and
 * the wrapper marks itself aria-hidden.
 *
 * See docs/brand/icons.md.
 */
export interface IconProps extends Omit<LucideProps, "size"> {
  icon: LucideIcon;
  size?: "ui" | "micro" | number;
  /** Required when icon is the only content of an interactive element. */
  label?: string;
}

const SIZE_MAP = { ui: 24, micro: 16 } as const;

export const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ icon: LucideComp, size = "ui", label, className, ...props }, ref) => {
    const px = typeof size === "number" ? size : SIZE_MAP[size];
    return (
      <LucideComp
        ref={ref}
        size={px}
        strokeWidth={2}
        aria-hidden={label ? undefined : true}
        aria-label={label}
        role={label ? "img" : undefined}
        className={cn("shrink-0", className)}
        {...props}
      />
    );
  }
);
Icon.displayName = "Icon";

import * as React from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface CharCountTextareaProps extends Omit<TextareaProps, "maxLength"> {
  /** Hard upper bound. Defaults to 5,000 to match long-form policy. */
  maxLength?: number;
  /** Renders as `<id>-counter`. Required for aria-describedby wiring. */
  id: string;
  /** Optional className for the wrapping element. */
  wrapperClassName?: string;
}

/**
 * Long-form textarea with a live "remaining characters" counter pinned to the
 * bottom-left of the field. Uses the project's design tokens — never literal
 * colors. Counter is announced to assistive tech via aria-live="polite".
 */
export const CharCountTextarea = React.forwardRef<HTMLTextAreaElement, CharCountTextareaProps>(
  ({ id, maxLength = 5000, value, className, wrapperClassName, "aria-describedby": describedBy, ...props }, ref) => {
    const counterId = `${id}-counter`;
    const used = typeof value === "string" ? value.length : 0;
    const remaining = Math.max(0, maxLength - used);
    const isNearLimit = remaining <= Math.max(50, Math.floor(maxLength * 0.05));
    const ariaDescribedBy = [describedBy, counterId].filter(Boolean).join(" ") || undefined;

    return (
      <div className={cn("space-y-1", wrapperClassName)}>
        <Textarea
          ref={ref}
          id={id}
          value={value}
          maxLength={maxLength}
          aria-describedby={ariaDescribedBy}
          className={cn("min-h-[120px]", className)}
          {...props}
        />
        <p
          id={counterId}
          aria-live="polite"
          className={cn(
            "text-xs text-muted-foreground text-left tabular-nums",
            isNearLimit && "text-warning",
            remaining === 0 && "text-destructive font-medium",
          )}
        >
          {remaining.toLocaleString()} / {maxLength.toLocaleString()} characters remaining
        </p>
      </div>
    );
  },
);
CharCountTextarea.displayName = "CharCountTextarea";

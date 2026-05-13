import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tech Fleet typography hierarchy — sentence case, Futura PT (display) /
 * Poppins (body) per Brand Visual Guide §3. Falls back to Jost / Inter.
 * Pages should stop hand-rolling sizes and use these primitives so voice +
 * scale stay consistent. See docs/brand/voice-and-tone.md and
 * docs/brand/typography.md.
 */

type AsProp<T extends React.ElementType> = { as?: T };
type PolymorphicProps<T extends React.ElementType, P = {}> = P &
  AsProp<T> &
  Omit<React.ComponentPropsWithoutRef<T>, keyof P | "as">;

export const PageTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    ref={ref}
    className={cn(
      "font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl",
      className
    )}
    {...props}
  />
));
PageTitle.displayName = "PageTitle";

export const SectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "font-display text-2xl font-semibold tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
SectionTitle.displayName = "SectionTitle";

export const SubsectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-display text-lg font-semibold tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
SubsectionTitle.displayName = "SubsectionTitle";

export const Lede = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-base leading-relaxed text-muted-foreground sm:text-lg", className)}
    {...props}
  />
));
Lede.displayName = "Lede";

export const Body = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm leading-relaxed text-foreground/90", className)} {...props} />
));
Body.displayName = "Body";

export const Muted = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
Muted.displayName = "Muted";

/**
 * Polymorphic helper: useful for rendering a typography style on a non-default
 * tag (e.g. `<PageTitle as="h2">` for an SEO-correct outline that visually
 * still reads as the page title).
 */
export function Typography<T extends React.ElementType = "p">({
  as,
  className,
  ...props
}: PolymorphicProps<T>) {
  const Comp = (as ?? "p") as React.ElementType;
  return <Comp className={cn("text-sm leading-relaxed text-foreground", className)} {...props} />;
}

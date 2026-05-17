import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tech Fleet Brand Visual Guide §Typography — exact spec.
 * https://guide.techfleet.org/resources/brand-guide/brand-visuals/typography
 *
 * Headings: Futura PT (Bold 700 except H4 Medium 500)
 * Body:     Poppins Regular (400)
 * Line height: 110% (leading-[1.1])
 * Letter spacing: 0.012em ("strict 1.2em" in the guide table)
 *
 * Element        Size (rem/px)
 * Display (Hero) 4.00rem / 64px  Futura Bold
 * H1 (Page)      3.00rem / 48px  Futura Bold
 * H2 (Section)   2.25rem / 36px  Futura Bold
 * H3 (Subsection)1.50rem / 24px  Futura Bold
 * H4 (Card)      1.25rem / 20px  Futura Medium
 * Body Large     1.125rem / 18px Poppins Regular
 * Body Standard  1.00rem / 16px  Poppins Regular
 * Body Small     0.875rem / 14px Poppins Regular
 * Caption/Micro  0.75rem / 12px  Poppins Regular
 */

const HEADING_BASE =
  "font-display font-bold leading-[1.1] tracking-[0.012em] text-foreground";
const HEADING_MEDIUM =
  "font-display font-medium leading-[1.1] tracking-[0.012em] text-foreground";
const BODY_BASE = "font-sans leading-[1.1] tracking-[0.012em]";

type AsProp<T extends React.ElementType> = { as?: T };
type PolymorphicProps<T extends React.ElementType, P = {}> = P &
  AsProp<T> &
  Omit<React.ComponentPropsWithoutRef<T>, keyof P | "as">;

/** Display / Hero — 64px Futura Bold. Render on a single H1 per page. */
export const Display = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    ref={ref}
    className={cn(HEADING_BASE, "text-[2.5rem] sm:text-[3.25rem] lg:text-[4rem]", className)}
    {...props}
  />
));
Display.displayName = "Display";

/** H1 Page Title — 48px Futura Bold. */
export const PageTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    ref={ref}
    className={cn(HEADING_BASE, "text-[2rem] sm:text-[2.5rem] lg:text-[3rem]", className)}
    {...props}
  />
));
PageTitle.displayName = "PageTitle";

/** H2 Section — 36px Futura Bold. */
export const SectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(HEADING_BASE, "text-[1.75rem] sm:text-[2rem] lg:text-[2.25rem]", className)}
    {...props}
  />
));
SectionTitle.displayName = "SectionTitle";

/** H3 Subsection — 24px Futura Bold. */
export const SubsectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(HEADING_BASE, "text-[1.25rem] sm:text-[1.5rem]", className)}
    {...props}
  />
));
SubsectionTitle.displayName = "SubsectionTitle";

/** H4 Card Title — 20px Futura Medium. Polymorphic (default h4). */
type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
};
export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as = "h4", ...props }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(HEADING_MEDIUM, "text-[1.125rem] sm:text-[1.25rem]", className)}
        {...props}
      />
    );
  }
);
CardTitle.displayName = "CardTitle";

/** Body Large — 18px Poppins. */
export const Lede = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(BODY_BASE, "text-[1.125rem] text-muted-foreground", className)}
    {...props}
  />
));
Lede.displayName = "Lede";

/** Body Standard — 16px Poppins. */
export const Body = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(BODY_BASE, "text-[1rem] text-foreground/90", className)}
    {...props}
  />
));
Body.displayName = "Body";

/** Body Small — 14px Poppins. */
export const BodySmall = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(BODY_BASE, "text-[0.875rem] text-foreground/90", className)}
    {...props}
  />
));
BodySmall.displayName = "BodySmall";

/** Caption / Micro — 12px Poppins muted. */
export const Caption = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(BODY_BASE, "text-[0.75rem] text-muted-foreground", className)}
    {...props}
  />
));
Caption.displayName = "Caption";

/** Backwards-compat muted small text. */
export const Muted = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(BODY_BASE, "text-[0.875rem] text-muted-foreground", className)}
    {...props}
  />
));
Muted.displayName = "Muted";

/** Polymorphic helper for arbitrary body text on any tag. */
export function Typography<T extends React.ElementType = "p">({
  as,
  className,
  ...props
}: PolymorphicProps<T>) {
  const Comp = (as ?? "p") as React.ElementType;
  return (
    <Comp
      className={cn(BODY_BASE, "text-[1rem] text-foreground", className)}
      {...props}
    />
  );
}

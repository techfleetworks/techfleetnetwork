import * as React from "react";

import { cn } from "@/lib/utils";

type CardVariant = "default" | "muted" | "compact";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Visual variant of the tf-card surface.
   * - default: full 40px asymmetric radius
   * - muted: same shape, muted background (nested cards)
   * - compact: 24px asymmetric radius (small tiles)
   */
  variant?: CardVariant;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "tf-card",
      variant === "muted" && "tf-card--muted",
      variant === "compact" && "tf-card--compact",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

/**
 * Universal information architecture (Brand Visual Guide v1):
 * - CardTitle    → H2 (36px Futura Bold, responsive clamp)
 * - CardDescription → H3 (24px Futura Bold)
 * The `as` escape hatch lets tight surfaces (popovers, KPI tiles, dialogs,
 * sidebar widgets) step the heading level down without losing semantics.
 */
type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};
const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as = "h2", ...props }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "tf-h font-display font-bold leading-[1.1] tracking-[0.012em] text-foreground break-words [overflow-wrap:anywhere] text-[clamp(1.25rem,2.25vw,1.75rem)]",
          className,
        )}
        {...props}
      />
    );
  },
);
CardTitle.displayName = "CardTitle";

type CardDescriptionProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h2" | "h3" | "h4" | "h5" | "h6" | "p";
};
const CardDescription = React.forwardRef<HTMLHeadingElement, CardDescriptionProps>(
  ({ className, as = "h3", ...props }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "tf-h font-display font-bold leading-[1.15] tracking-[0.012em] text-muted-foreground text-[1.125rem] sm:text-[1.25rem]",
          className,
        )}
        {...props}
      />
    );
  },
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

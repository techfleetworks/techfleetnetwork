import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Tech Fleet partner-page button base (verbatim port from
// techfleet.org/partner .framer-1dba239 + .framer-1m8ay15): asymmetric
// corner radius (top-left + bottom-right only), Poppins 20px / 1px tracking.
const tfFramerBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-poppins tracking-[1px] text-base leading-none rounded-tl-lg rounded-br-lg rounded-tr-none rounded-bl-none transition-all duration-200 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer no-underline";

const buttonVariants = cva(tfFramerBase, {
    variants: {
      variant: {
        default:
          "bg-[var(--tf-btn-primary-bg)] text-[color:var(--tf-btn-primary-fg)] font-bold shadow-[var(--tf-btn-shadow)] hover:-translate-y-[1px] hover:shadow-[var(--tf-btn-shadow-hover)]",
        destructive:
          "bg-destructive text-destructive-foreground font-bold shadow-[var(--tf-btn-shadow)] hover:-translate-y-[1px] hover:shadow-[var(--tf-btn-shadow-hover)] rounded-tl-lg rounded-br-lg",
        outline:
          "bg-[var(--tf-btn-secondary-bg)] text-[color:var(--tf-btn-secondary-fg)] border border-[color:var(--tf-btn-secondary-border)] hover:bg-[var(--tf-btn-secondary-bg-hover)]",
        secondary:
          "bg-[var(--tf-btn-secondary-bg)] text-[color:var(--tf-btn-secondary-fg)] border border-[color:var(--tf-btn-secondary-border)] hover:bg-[var(--tf-btn-secondary-bg-hover)]",
        ghost:
          "rounded-md hover:bg-accent hover:text-accent-foreground",
        link:
          "rounded-none text-primary-text underline-offset-4 hover:underline",
        hero:
          "bg-[var(--tf-btn-primary-bg)] text-[color:var(--tf-btn-primary-fg)] font-bold shadow-[var(--tf-btn-shadow)] hover:bg-[#4d8cff] hover:-translate-y-[1px] hover:shadow-[var(--tf-btn-shadow-hover)]",
        "hero-outline":
          "bg-[var(--tf-btn-secondary-bg)] text-[color:var(--tf-btn-secondary-fg)] border border-[color:var(--tf-btn-secondary-border)] hover:bg-[var(--tf-btn-secondary-bg-hover)]",
        success:
          "bg-success text-success-foreground font-bold shadow-[var(--tf-btn-shadow)] hover:-translate-y-[1px] hover:shadow-[var(--tf-btn-shadow-hover)]",
      },
      size: {
        default: "h-10 px-[30px] py-0",
        sm: "h-10 px-5 py-0 text-sm sm:text-base",
        lg: "h-10 px-[36px] py-0 w-full lg:w-auto",
        xl: "h-10 px-[40px] py-0 w-full lg:w-auto",
        icon: "h-10 w-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

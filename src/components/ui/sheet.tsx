import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Enables drag-to-resize on the inner edge of the sheet. Defaults to true.
   * Set to false to opt out (e.g. for the mobile sidebar drawer).
   */
  resizable?: boolean;
  /**
   * Persist the user-chosen size under this key in localStorage.
   * If omitted, the size is in-memory only for the panel's lifetime.
   */
  resizeKey?: string;
  /** Min/max bounds in pixels. Defaults: min 320, max ~95% of viewport. */
  minSize?: number;
  maxSize?: number;
}

const STORAGE_PREFIX = "tf:sheet-size:";
const DEFAULT_MIN = 320;

const isHorizontal = (side: SheetContentProps["side"]) => side === "left" || side === "right";

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  (
    {
      side = "right",
      className,
      children,
      style,
      resizable = true,
      resizeKey,
      minSize = DEFAULT_MIN,
      maxSize,
      ...props
    },
    ref,
  ) => {
    const horizontal = isHorizontal(side);
    const storageKey = resizeKey ? `${STORAGE_PREFIX}${resizeKey}` : null;

    const [size, setSize] = React.useState<number | null>(() => {
      if (!resizable || typeof window === "undefined" || !storageKey) return null;
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored ? Number.parseInt(stored, 10) : NaN;
      return Number.isFinite(parsed) && parsed >= minSize ? parsed : null;
    });

    const dragStateRef = React.useRef<{
      startCoord: number;
      startSize: number;
    } | null>(null);

    const getMaxSize = React.useCallback(() => {
      if (typeof window === "undefined") return Number.POSITIVE_INFINITY;
      const viewport = horizontal ? window.innerWidth : window.innerHeight;
      return maxSize ?? Math.floor(viewport * 0.95);
    }, [horizontal, maxSize]);

    const onPointerDown = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const panel = target.parentElement as HTMLElement | null;
        const currentSize =
          size ?? (panel ? (horizontal ? panel.getBoundingClientRect().width : panel.getBoundingClientRect().height) : minSize);
        dragStateRef.current = {
          startCoord: horizontal ? event.clientX : event.clientY,
          startSize: currentSize,
        };
        document.body.style.userSelect = "none";
        document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
      },
      [horizontal, minSize, size],
    );

    const onPointerMove = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag) return;
        const coord = horizontal ? event.clientX : event.clientY;
        // Direction: dragging away from the sheet's anchor edge grows it.
        // right: handle is on the left edge → moving left (smaller X) grows.
        // left: handle is on the right edge → moving right (larger X) grows.
        // top: handle is on the bottom edge → moving down (larger Y) grows.
        // bottom: handle is on the top edge → moving up (smaller Y) grows.
        const delta = coord - drag.startCoord;
        const directionalDelta =
          side === "right" || side === "bottom" ? -delta : delta;
        const next = Math.min(getMaxSize(), Math.max(minSize, Math.round(drag.startSize + directionalDelta)));
        setSize(next);
      },
      [getMaxSize, horizontal, minSize, side],
    );

    const onPointerUp = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        dragStateRef.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        if (drag && storageKey && size != null) {
          try {
            window.localStorage.setItem(storageKey, String(size));
          } catch {
            /* storage may be unavailable; ignore */
          }
        }
      },
      [size, storageKey],
    );

    const onDoubleClick = React.useCallback(() => {
      if (storageKey) {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
      }
      setSize(null);
    }, [storageKey]);

    const sizeStyle: React.CSSProperties = resizable && size != null
      ? horizontal
        ? { width: `${size}px`, maxWidth: "95vw" }
        : { height: `${size}px`, maxHeight: "95vh" }
      : {};

    // Resize-aware class: when a custom size is applied, drop the
    // default w-3/4 / sm:max-w-sm constraints so inline style wins.
    const resizableSideOverrides =
      resizable && size != null
        ? horizontal
          ? "!w-auto !max-w-none sm:!max-w-none"
          : "!h-auto !max-h-none"
        : "";

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={ref}
          className={cn(sheetVariants({ side }), resizableSideOverrides, className)}
          style={{ ...sizeStyle, ...style }}
          {...props}
        >
          {children}
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>

          {resizable && (
            <div
              role="separator"
              aria-orientation={horizontal ? "vertical" : "horizontal"}
              aria-label="Resize panel (double-click to reset)"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
              className={cn(
                "group absolute z-50 flex items-center justify-center transition-colors",
                "hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none",
                horizontal
                  ? "top-0 h-full w-2 cursor-col-resize"
                  : "left-0 w-full h-2 cursor-row-resize",
                side === "right" && "left-0 -translate-x-1/2",
                side === "left" && "right-0 translate-x-1/2",
                side === "top" && "bottom-0 translate-y-1/2",
                side === "bottom" && "top-0 -translate-y-1/2",
              )}
            >
              <div
                aria-hidden="true"
                className={cn(
                  "rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary",
                  horizontal ? "h-12 w-1" : "w-12 h-1",
                )}
              />
            </div>
          )}
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};

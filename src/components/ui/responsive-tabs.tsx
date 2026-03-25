import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

/* ─── Root ─────────────────────────────────────────────── */
interface ResponsiveTabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  children: React.ReactNode;
}

function ResponsiveTabs({ children, ...props }: ResponsiveTabsProps) {
  return <TabsPrimitive.Root {...props}>{children}</TabsPrimitive.Root>;
}

/* ─── Tab definition passed to the list ────────────────── */
export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/* ─── List: dropdown on mobile, tabs on tablet+ ────────── */
interface ResponsiveTabsListProps {
  tabs: TabItem[];
  className?: string;
  /** Current value — needed for the mobile dropdown label */
  value?: string;
  onValueChange?: (value: string) => void;
}

function ResponsiveTabsList({ tabs, className, value, onValueChange }: ResponsiveTabsListProps) {
  const isMobile = useIsMobile();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Close on Escape
  React.useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dropdownOpen]);

  const activeTab = tabs.find((t) => t.value === value) ?? tabs[0];

  if (isMobile) {
    return (
      <div ref={dropdownRef} className={cn("relative w-full", className)}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className={cn(
            "flex items-center justify-between w-full rounded-lg border bg-card px-4 py-3",
            "text-sm font-semibold text-foreground shadow-sm",
            "hover:bg-accent/50 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          aria-label="Select tab"
        >
          <span className="flex items-center gap-2 min-w-0">
            {activeTab?.icon}
            <span className="truncate">{activeTab?.label}</span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
              dropdownOpen && "rotate-180"
            )}
          />
        </button>

        {dropdownOpen && (
          <div
            className={cn(
              "absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg",
              "animate-in fade-in-0 zoom-in-95 duration-150"
            )}
            role="listbox"
            aria-label="Tab options"
          >
            {tabs.map((tab) => {
              const isActive = tab.value === value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  disabled={tab.disabled}
                  onClick={() => {
                    onValueChange?.(tab.value);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-left transition-colors",
                    "first:rounded-t-lg last:rounded-b-lg",
                    "hover:bg-accent/50",
                    "focus-visible:outline-none focus-visible:bg-accent/50",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground",
                    tab.disabled && "opacity-50 cursor-not-allowed pointer-events-none"
                  )}
                  role="option"
                  aria-selected={isActive}
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Desktop / tablet: standard tabs
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-11 items-center rounded-md bg-muted p-1 text-muted-foreground overflow-x-auto scrollbar-none max-w-full",
        className
      )}
    >
      {tabs.map((tab) => (
        <TabsPrimitive.Trigger
          key={tab.value}
          value={tab.value}
          disabled={tab.disabled}
          onClick={() => onValueChange?.(tab.value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold ring-offset-background transition-all",
            "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "gap-1.5"
          )}
        >
          {tab.icon}
          {tab.label}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

/* ─── Content: thin wrapper ────────────────────────────── */
const ResponsiveTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
ResponsiveTabsContent.displayName = "ResponsiveTabsContent";

export { ResponsiveTabs, ResponsiveTabsList, ResponsiveTabsContent };

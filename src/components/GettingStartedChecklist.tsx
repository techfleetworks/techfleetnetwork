import { useState, useEffect, useMemo, type ElementType } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Lock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
  id: string;
  title: string;
  /** Short, friendly subtitle, like "Customize your profile." */
  subtitle: string;
  icon: ElementType;
  href: string;
  completed: boolean;
  locked?: boolean;
  prerequisiteLabel?: string;
}

interface GettingStartedChecklistProps {
  /** Visible heading, e.g. "Getting started" */
  title: string;
  items: ChecklistItem[];
  /** Storage key suffix used to remember collapse + dismiss state per user */
  storageKey?: string;
  /** Optional: hide the dismiss "X" entirely (e.g. when always-on) */
  dismissible?: boolean;
}

/**
 * Gumroad-style onboarding checklist.
 *
 * - Card grid (1/2/4 cols responsive) with an icon, bold title, and subtitle.
 * - Top-right status circle: empty when incomplete, filled check when done.
 * - "Show less / Show more" toggle collapses the grid, keeping the header visible.
 * - "X" dismisses the whole checklist; preference is persisted in localStorage.
 *
 * WCAG: each card is a real <Link> (keyboard reachable), status is mirrored in
 * an aria-label, the toggle/dismiss buttons are >=32px hit targets with
 * descriptive aria-labels, and the live progress is announced via aria-live.
 */
export function GettingStartedChecklist({
  title,
  items,
  storageKey = "default",
  dismissible = true,
}: GettingStartedChecklistProps) {
  const collapseKey = `tf:onboarding-checklist:collapsed:${storageKey}`;
  const dismissKey = `tf:onboarding-checklist:dismissed:${storageKey}`;

  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapseKey) === "1");
      setDismissed(localStorage.getItem(dismissKey) === "1");
    } catch {
      // localStorage may be unavailable (privacy mode) — fall back to defaults.
    }
  }, [collapseKey, dismissKey]);

  const completed = useMemo(() => items.filter((i) => i.completed).length, [items]);
  const total = items.length;
  const allDone = total > 0 && completed === total;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      /* ignore */
    }
  };

  if (dismissed) return null;

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="card-elevated overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b">
        <div className="min-w-0">
          <h2
            id="getting-started-heading"
            className="text-base sm:text-lg font-semibold text-foreground truncate"
          >
            {title}
          </h2>
          <p
            className="text-xs text-muted-foreground mt-0.5"
            aria-live="polite"
          >
            {allDone
              ? "All steps complete — nice work!"
              : `${completed} of ${total} complete`}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="getting-started-grid"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring underline-offset-2 hover:underline"
          >
            {collapsed ? (
              <>
                Show more
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Show less
                <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            )}
          </button>
          {dismissible && (
            <button
              type="button"
              onClick={dismiss}
              aria-label={`Dismiss ${title} checklist`}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div
          id="getting-started-grid"
          className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {items.map((item) => (
            <ChecklistCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChecklistCard({ item }: { item: ChecklistItem }) {
  const Icon = item.icon;
  const { completed, locked } = item;

  const statusLabel = locked
    ? `Locked — complete ${item.prerequisiteLabel ?? "previous step"} first`
    : completed
      ? "Complete"
      : "Not yet complete";

  const cardClass = cn(
    "group relative flex flex-col items-center text-center rounded-lg border bg-card p-4 sm:p-5 min-h-[160px] transition-all",
    locked
      ? "opacity-60 cursor-not-allowed"
      : "hover:border-primary/50 hover:shadow-sm focus-within:ring-2 focus-within:ring-ring"
  );

  const inner = (
    <>
      {/* Status circle / lock — top right */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-3 right-3 inline-flex items-center justify-center h-6 w-6 rounded-full border-2 transition-colors",
          locked
            ? "border-muted-foreground/30 bg-muted"
            : completed
              ? "border-success bg-success text-success-foreground"
              : "border-muted-foreground/40 bg-transparent"
        )}
      >
        {locked ? (
          <Lock className="h-3 w-3 text-muted-foreground" />
        ) : completed ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : null}
      </span>

      <span
        className={cn(
          "flex items-center justify-center h-12 w-12 rounded-xl mb-3",
          completed ? "bg-success/10" : "bg-primary/10"
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            completed ? "text-success" : "text-primary"
          )}
          aria-hidden="true"
        />
      </span>

      <h3 className="font-semibold text-sm text-foreground mb-1">
        {item.title}
      </h3>
      <p className="text-xs text-muted-foreground leading-snug">
        {item.subtitle}
      </p>
    </>
  );

  if (locked) {
    return (
      <div
        className={cardClass}
        aria-label={`${item.title}. ${statusLabel}.`}
        role="group"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      to={item.href}
      className={cardClass}
      aria-label={`${item.title}. ${item.subtitle} ${statusLabel}.`}
    >
      {inner}
    </Link>
  );
}

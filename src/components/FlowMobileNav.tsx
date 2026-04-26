import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowMobileNavProps {
  backTo: string;
  backLabel: string;
  title: string;
  className?: string;
}

export function FlowMobileNav({ backTo, backLabel, title, className }: FlowMobileNavProps) {
  return (
    <header className={cn("sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden", className)}>
      <div className="flex items-center gap-3">
        <Link
          to={backTo}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={backLabel}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{backLabel}</p>
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
      </div>
    </header>
  );
}
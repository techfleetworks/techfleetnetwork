import type { LucideIcon } from "lucide-react";

interface SectionEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function SectionEmptyState({ icon: Icon, title, description }: SectionEmptyStateProps) {
  return (
    <div className="card-elevated flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

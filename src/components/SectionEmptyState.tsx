import type { LucideIcon } from "lucide-react";

interface SectionEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
}

export function SectionEmptyState({ title, description }: SectionEmptyStateProps) {
  return (
    <div className="tf-card flex flex-col items-center justify-center py-10 px-4 text-center">
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

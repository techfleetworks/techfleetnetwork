import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ALL_WIDGETS,
  type DashboardWidgetId,
} from "@/hooks/use-dashboard-preferences";

interface DashboardCustomizerProps {
  visibleWidgets: DashboardWidgetId[];
  onToggle: (id: DashboardWidgetId) => void;
}

export function DashboardCustomizer({ visibleWidgets, onToggle }: DashboardCustomizerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Customize</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Dashboard Sections
        </h3>
        <div className="space-y-3">
          {ALL_WIDGETS.map(({ id, label }) => (
            <div key={id} className="flex items-center justify-between gap-3">
              <Label
                htmlFor={`widget-${id}`}
                className="text-sm text-foreground cursor-pointer flex-1"
              >
                {label}
              </Label>
              <Switch
                id={`widget-${id}`}
                checked={visibleWidgets.includes(id)}
                onCheckedChange={() => onToggle(id)}
                aria-label={`Show ${label}`}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

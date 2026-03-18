import { useState, useCallback, useRef } from "react";
import { Settings2, GripVertical } from "lucide-react";
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
  widgetOrder: DashboardWidgetId[];
  onToggle: (id: DashboardWidgetId) => void;
  onReorder: (ordered: DashboardWidgetId[]) => void;
}

const widgetLabel = (id: DashboardWidgetId) =>
  ALL_WIDGETS.find((w) => w.id === id)?.label ?? id;

export function DashboardCustomizer({
  visibleWidgets,
  widgetOrder,
  onToggle,
  onReorder,
}: DashboardCustomizerProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      setDragIdx(idx);
      dragNode.current = e.currentTarget;
      e.dataTransfer.effectAllowed = "move";
      // Delay adding dragging style so the ghost image looks normal
      requestAnimationFrame(() => {
        dragNode.current?.classList.add("opacity-40");
      });
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverIdx(idx);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === dropIdx) return;
      const updated = [...widgetOrder];
      const [moved] = updated.splice(dragIdx, 1);
      updated.splice(dropIdx, 0, moved);
      onReorder(updated);
    },
    [dragIdx, widgetOrder, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    dragNode.current?.classList.remove("opacity-40");
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Customize</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Dashboard Sections
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Drag to reorder · Toggle to show or hide
        </p>
        <div className="space-y-1" role="list" aria-label="Reorder dashboard sections">
          {widgetOrder.map((id, idx) => (
            <div
              key={id}
              role="listitem"
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 rounded-md px-2 py-2 transition-colors select-none ${
                overIdx === idx && dragIdx !== null && dragIdx !== idx
                  ? "bg-primary/10"
                  : "hover:bg-muted/50"
              }`}
            >
              <GripVertical
                className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing"
                aria-hidden="true"
              />
              <Label
                htmlFor={`widget-${id}`}
                className="text-sm text-foreground cursor-pointer flex-1"
              >
                {widgetLabel(id)}
              </Label>
              <Switch
                id={`widget-${id}`}
                checked={visibleWidgets.includes(id)}
                onCheckedChange={() => onToggle(id)}
                aria-label={`Show ${widgetLabel(id)}`}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

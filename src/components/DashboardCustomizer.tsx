import { useState, useCallback, useRef } from "react";
import { Settings2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
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
import { useAnnounce } from "@/components/LiveAnnouncer";

interface DashboardCustomizerProps {
  visibleWidgets: DashboardWidgetId[];
  widgetOrder: DashboardWidgetId[];
  onToggle: (id: DashboardWidgetId) => void;
  onReorder: (ordered: DashboardWidgetId[]) => void;
  /** IDs to exclude from the picker (e.g. admin-only widgets for non-admins) */
  excludeIds?: DashboardWidgetId[];
}

const widgetLabel = (id: DashboardWidgetId) =>
  ALL_WIDGETS.find((w) => w.id === id)?.label ?? id;

export function DashboardCustomizer({
  visibleWidgets,
  widgetOrder,
  onToggle,
  onReorder,
  excludeIds,
}: DashboardCustomizerProps) {
  const excluded = new Set(excludeIds ?? []);
  const displayedOrder = widgetOrder.filter((id) => !excluded.has(id));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);
  const announce = useAnnounce();

  // WCAG 2.5.7 Dragging Movements — keyboard alternative for the drag/drop
  // reorder. Move-up / Move-down buttons reorder the widget list and
  // announce the change in a polite live region for screen-reader users.
  const moveByKeyboard = useCallback(
    (idx: number, direction: -1 | 1) => {
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= displayedOrder.length) return;
      const movedId = displayedOrder[idx];
      const targetId = displayedOrder[targetIdx];
      const fromFull = widgetOrder.indexOf(movedId);
      const toFull = widgetOrder.indexOf(targetId);
      if (fromFull === -1 || toFull === -1) return;
      const updated = [...widgetOrder];
      const [moved] = updated.splice(fromFull, 1);
      updated.splice(toFull, 0, moved);
      onReorder(updated);
      announce(
        `${widgetLabel(movedId)} moved ${direction === -1 ? "up" : "down"} to position ${targetIdx + 1} of ${displayedOrder.length}.`,
        "polite",
      );
    },
    [displayedOrder, widgetOrder, onReorder, announce],
  );

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
      // Map displayed indices back to full widgetOrder
      const movedId = displayedOrder[dragIdx];
      const targetId = displayedOrder[dropIdx];
      const fromFull = widgetOrder.indexOf(movedId);
      const toFull = widgetOrder.indexOf(targetId);
      if (fromFull === -1 || toFull === -1) return;
      const updated = [...widgetOrder];
      const [moved] = updated.splice(fromFull, 1);
      updated.splice(toFull, 0, moved);
      onReorder(updated);
    },
    [dragIdx, widgetOrder, displayedOrder, onReorder],
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
          Drag, or use the Move buttons, to reorder · Toggle to show or hide
        </p>
        <div
          className="space-y-1"
          role="list"
          aria-label="Reorder dashboard sections"
          data-keyboard-alt-control="dashboard-reorder"
        >
          {displayedOrder.map((id, idx) => (
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Move ${widgetLabel(id)} up`}
                disabled={idx === 0}
                onClick={() => moveByKeyboard(idx, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Move ${widgetLabel(id)} down`}
                disabled={idx === displayedOrder.length - 1}
                onClick={() => moveByKeyboard(idx, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
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

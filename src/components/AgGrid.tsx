import { useCallback, useEffect, useMemo, useRef } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import type {
  ColDef, GridReadyEvent, ColumnResizedEvent, SortChangedEvent,
  FilterChangedEvent, ColumnMovedEvent, ColumnVisibleEvent, GridApi,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { useTheme } from "@/components/ThemeProvider";
import { useGridState, type GridState } from "@/hooks/use-grid-state";
import { Button } from "@/components/ui/button";
import { RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props<T> extends AgGridReactProps<T> {
  height?: string;
  /** Unique id used to persist grid state per user. If omitted, state is not persisted. */
  gridId?: string;
  /** Hide the reset view button even when gridId is set */
  hideResetButton?: boolean;
  /** Extra buttons/controls rendered in the toolbar row alongside Reset View */
  toolbarLeft?: React.ReactNode;
  /** Show CSV export button in toolbar */
  showExportCsv?: boolean;
  /** Custom CSV filename prefix (default: gridId or "export") */
  exportFileName?: string;
  /** Callback to receive the grid API reference */
  onApiReady?: (api: GridApi<T>) => void;
}

export function ThemedAgGrid<T = unknown>({
  height = "400px",
  gridId,
  hideResetButton,
  toolbarLeft,
  showExportCsv,
  exportFileName,
  onApiReady,
  defaultColDef,
  onGridReady: externalOnGridReady,
  onSortChanged: externalOnSortChanged,
  onFilterChanged: externalOnFilterChanged,
  onColumnResized: externalOnColumnResized,
  onColumnMoved: externalOnColumnMoved,
  columnDefs,
  ...rest
}: Props<T>) {
  const { resolvedTheme } = useTheme();
  const themeClass = resolvedTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";
  const apiRef = useRef<GridApi<T> | null>(null);

  const { savedState, loaded, persistState, clearState } = useGridState(gridId ?? "");

  const mergedColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      floatingFilter: true,
      flex: 1,
      minWidth: 80,
      wrapText: true,
      autoHeight: true,
      ...defaultColDef,
    }),
    [defaultColDef]
  );

  const saveCurrentState = useCallback(() => {
    if (!gridId || !apiRef.current) return;
    const api = apiRef.current;
    const state: GridState = {
      columnState: api.getColumnState(),
      filterModel: api.getFilterModel(),
    };
    persistState(state);
  }, [gridId, persistState]);

  const resetView = useCallback(async () => {
    await clearState();
    if (apiRef.current) {
      apiRef.current.resetColumnState();
      apiRef.current.setFilterModel(null);
      apiRef.current.sizeColumnsToFit();
    }
    toast.success("Table view reset to default");
  }, [clearState]);

  const handleExportCsv = useCallback(() => {
    if (!apiRef.current) return;
    const prefix = exportFileName ?? gridId ?? "export";
    apiRef.current.exportDataAsCsv({
      fileName: `${prefix}-${format(new Date(), "yyyy-MM-dd")}`,
    });
  }, [exportFileName, gridId]);

  const handleGridReady = useCallback(
    (e: GridReadyEvent<T>) => {
      apiRef.current = e.api;
      onApiReady?.(e.api as unknown as GridApi<T>);
      if (gridId && savedState) {
        if (savedState.columnState) {
          e.api.applyColumnState({ state: savedState.columnState, applyOrder: true });
        }
        if (savedState.filterModel) {
          setTimeout(() => e.api.setFilterModel(savedState.filterModel!), 0);
        }
      } else {
        e.api.sizeColumnsToFit();
      }
      externalOnGridReady?.(e);
    },
    [gridId, savedState, externalOnGridReady, onApiReady]
  );

  const handleSortChanged = useCallback(
    (e: SortChangedEvent<T>) => { saveCurrentState(); externalOnSortChanged?.(e); },
    [saveCurrentState, externalOnSortChanged]
  );

  const handleFilterChanged = useCallback(
    (e: FilterChangedEvent<T>) => { saveCurrentState(); externalOnFilterChanged?.(e); },
    [saveCurrentState, externalOnFilterChanged]
  );

  const handleColumnResized = useCallback(
    (e: ColumnResizedEvent<T>) => { if (e.finished) saveCurrentState(); externalOnColumnResized?.(e); },
    [saveCurrentState, externalOnColumnResized]
  );

  const handleColumnMoved = useCallback(
    (e: ColumnMovedEvent<T>) => { if (e.finished) saveCurrentState(); externalOnColumnMoved?.(e); },
    [saveCurrentState, externalOnColumnMoved]
  );

  const handleColumnVisible = useCallback(
    (_e: ColumnVisibleEvent<T>) => { saveCurrentState(); },
    [saveCurrentState]
  );

  const showToolbar = toolbarLeft || (gridId && !hideResetButton) || showExportCsv;

  if (gridId && !loaded) {
    return (
      <div className={themeClass} style={{ height, width: "100%" }} role="status" aria-label="Loading grid">
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {gridId && !hideResetButton && (
            <Button variant="outline" size="sm" onClick={resetView} className="gap-1.5 text-xs h-9">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset View
            </Button>
          )}
          {showExportCsv && (
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5 text-xs h-9">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
          {toolbarLeft}
        </div>
      )}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div key={themeClass} className={themeClass} style={{ height, width: "100%", minWidth: "600px" }}>
          <AgGridReact<T>
            defaultColDef={mergedColDef}
            columnDefs={columnDefs}
            animateRows
            onGridReady={handleGridReady}
            onSortChanged={handleSortChanged}
            onFilterChanged={handleFilterChanged}
            onColumnResized={handleColumnResized}
            onColumnMoved={handleColumnMoved}
            onColumnVisible={handleColumnVisible}
            {...rest}
          />
        </div>
      </div>
    </div>
  );
}

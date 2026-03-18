import { useCallback, useMemo, useRef } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import type { ColDef, GridReadyEvent, ColumnResizedEvent, SortChangedEvent, FilterChangedEvent, ColumnMovedEvent, GridApi } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { useTheme } from "next-themes";
import { useGridState, type GridState } from "@/hooks/use-grid-state";

interface Props<T> extends AgGridReactProps<T> {
  height?: string;
  /** Unique id used to persist grid state per user. If omitted, state is not persisted. */
  gridId?: string;
}

export function ThemedAgGrid<T = unknown>({
  height = "400px",
  gridId,
  defaultColDef,
  onGridReady: externalOnGridReady,
  onSortChanged: externalOnSortChanged,
  onFilterChanged: externalOnFilterChanged,
  onColumnResized: externalOnColumnResized,
  onColumnMoved: externalOnColumnMoved,
  ...rest
}: Props<T>) {
  const { resolvedTheme } = useTheme();
  const themeClass = resolvedTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";
  const apiRef = useRef<GridApi<T> | null>(null);

  const { savedState, loaded, persistState } = useGridState(gridId ?? "");

  const mergedColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      flex: 1,
      minWidth: 80,
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

  const handleGridReady = useCallback(
    (e: GridReadyEvent<T>) => {
      apiRef.current = e.api;
      // Restore saved state
      if (gridId && savedState) {
        if (savedState.columnState) {
          e.api.applyColumnState({ state: savedState.columnState, applyOrder: true });
        }
        if (savedState.filterModel) {
          e.api.setFilterModel(savedState.filterModel);
        }
      }
      // Size columns to fit container
      e.api.sizeColumnsToFit();
      externalOnGridReady?.(e);
    },
    [gridId, savedState, externalOnGridReady]
  );

  const handleSortChanged = useCallback(
    (e: SortChangedEvent<T>) => {
      saveCurrentState();
      externalOnSortChanged?.(e);
    },
    [saveCurrentState, externalOnSortChanged]
  );

  const handleFilterChanged = useCallback(
    (e: FilterChangedEvent<T>) => {
      saveCurrentState();
      externalOnFilterChanged?.(e);
    },
    [saveCurrentState, externalOnFilterChanged]
  );

  const handleColumnResized = useCallback(
    (e: ColumnResizedEvent<T>) => {
      if (e.finished) {
        saveCurrentState();
      }
      externalOnColumnResized?.(e);
    },
    [saveCurrentState, externalOnColumnResized]
  );

  const handleColumnMoved = useCallback(
    (e: ColumnMovedEvent<T>) => {
      if (e.finished) {
        saveCurrentState();
      }
      externalOnColumnMoved?.(e);
    },
    [saveCurrentState, externalOnColumnMoved]
  );

  // Don't render until saved state is loaded so we can apply it on first render
  if (gridId && !loaded) {
    return (
      <div className={themeClass} style={{ height, width: "100%" }} role="status" aria-label="Loading grid">
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className={themeClass} style={{ height, width: "100%" }}>
      <AgGridReact<T>
        defaultColDef={mergedColDef}
        animateRows
        onGridReady={handleGridReady}
        onSortChanged={handleSortChanged}
        onFilterChanged={handleFilterChanged}
        onColumnResized={handleColumnResized}
        onColumnMoved={handleColumnMoved}
        {...rest}
      />
    </div>
  );
}

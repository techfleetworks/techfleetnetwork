import { useMemo } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  themeAlpine,
} from "ag-grid-community";

// Register all community modules once
ModuleRegistry.registerModules([AllCommunityModule]);

interface Props<T> extends AgGridReactProps<T> {
  height?: string;
}

export function ThemedAgGrid<T = unknown>({
  height = "400px",
  defaultColDef,
  ...rest
}: Props<T>) {
  const mergedColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      ...defaultColDef,
    }),
    [defaultColDef]
  );

  return (
    <div style={{ height, width: "100%" }}>
      <AgGridReact<T>
        theme={themeAlpine}
        defaultColDef={mergedColDef}
        animateRows
        {...rest}
      />
    </div>
  );
}

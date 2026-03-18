import { useMemo } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { useTheme } from "next-themes";

interface Props<T> extends AgGridReactProps<T> {
  height?: string;
}

export function ThemedAgGrid<T = unknown>({
  height = "400px",
  defaultColDef,
  ...rest
}: Props<T>) {
  const { resolvedTheme } = useTheme();

  const themeClass =
    resolvedTheme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

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
    <div className={themeClass} style={{ height, width: "100%" }}>
      <AgGridReact<T>
        defaultColDef={mergedColDef}
        animateRows
        {...rest}
      />
    </div>
  );
}

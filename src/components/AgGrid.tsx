import { useMemo } from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { useTheme } from "next-themes";
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
  const { resolvedTheme } = useTheme();

  const theme = useMemo(
    () =>
      resolvedTheme === "dark" ? themeAlpine.withPart(themeAlpine) : themeAlpine,
    [resolvedTheme]
  );

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
        theme={theme}
        defaultColDef={mergedColDef}
        animateRows
        {...rest}
      />
    </div>
  );
}

import { useMemo, type ReactNode } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { createAppTheme } from "../theme/createAppTheme";
import type { Mode } from "../theme/tokens";

/**
 * Pin a subtree to a specific TFDS theme mode, regardless of the app's current light/dark
 * setting. Unlike {@link DesignSystemProvider} (which follows the app theme), this forces
 * the mode — for surfaces that are intentionally single-theme, e.g. a branded onboarding
 * flow whose illustrations only read on a light background.
 *
 * Lives in the design system so callers never import `@mui/material` directly
 * (design-system/no-direct-mui).
 */
export function ThemeModeProvider({
  mode,
  children,
}: {
  mode: Mode;
  children: ReactNode;
}) {
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  return <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>;
}

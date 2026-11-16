import { useEffect, useMemo } from "react";
import { ThemeProvider } from "@mui/material/styles";
import { Box, Button, createAppTheme } from "@/design-system";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { WelcomeTopStepper } from "./WelcomeTopStepper";
import { canGoBack, isLastStep, WELCOME_STEP_HEADING_ID } from "./navigation";
import { WELCOME_NAV } from "./content";
import type { WelcomeStepDef } from "./steps";

export interface WelcomeFlowShellProps {
  steps: readonly WelcomeStepDef[];
  /** 0-based index of the active step (already clamped by the caller). */
  step: number;
  onNext: () => void;
  onBack: () => void;
}

/** A hand-drawn-style directional arrow for the footer nav (matches the prototype's
 *  unDraw arrow without adding an SVGR dependency). */
function NavArrow({ dir }: { dir: "left" | "right" }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 40 12"
      aria-hidden
      sx={{
        width: 32,
        height: 12,
        transform: dir === "left" ? "scaleX(-1)" : "none",
      }}
    >
      <path
        d="M1 6h36M30 1l7 5-7 5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Box>
  );
}

/**
 * The un-skippable, full-screen Welcome Flow shell, rebuilt to the Figma prototype
 * ("Welcome Flow" page, 8770:8597). A light-gray branding panel on the left carries only
 * the Tech Fleet logo; the right column holds a check-style top stepper, the active step,
 * and a footer with "Back" / "Next" arrow links. There is NO Skip or close affordance —
 * the only way out is finishing the flow (§4.2 FR-N2).
 *
 * The whole flow is pinned to the design system's LIGHT theme regardless of the member's
 * app theme: the prototype is a light branded moment and the unDraw line-art illustrations
 * (black strokes, transparent light areas) are only legible on a light surface. Contrast
 * stays WCAG AA because the light theme's tokens are AA by construction.
 *
 * Accessibility (§12.2/§12.3): on every step change focus moves to the step heading so
 * keyboard and screen-reader users land on the new content (WCAG 2.4.3), and a polite
 * live region announces "Step N of M: <title>". The top stepper is decorative/aria-hidden
 * so progress is not announced twice.
 */
export function WelcomeFlowShell({ steps, step, onNext, onBack }: WelcomeFlowShellProps) {
  const total = steps.length;
  const active = steps[step];
  const ActiveComponent = active?.Component;
  const lightTheme = useMemo(() => createAppTheme("light"), []);
  const last = isLastStep(step, total);

  // Move focus to the step heading on every step change (and on mount). Only one step
  // renders at a time, so the shared heading id resolves to the current step's heading.
  useEffect(() => {
    const heading = document.getElementById(WELCOME_STEP_HEADING_ID);
    heading?.focus();
  }, [step]);

  if (!active || !ActiveComponent) return null;

  const announce = `Step ${step + 1} of ${total}: ${active.title}`;

  return (
    <ThemeProvider theme={lightTheme}>
      <Box
        sx={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          bgcolor: "background.paper",
          color: "text.primary",
          pt: "env(safe-area-inset-top)",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Left branding panel — light gray, Tech Fleet logo only (prototype 8873:1343). */}
        <Box
          sx={{
            flex: { xs: "0 0 auto", md: "0 0 33%" },
            bgcolor: "grey.100",
            px: { xs: 3, md: 5 },
            py: { xs: 3, md: 5 },
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          <Box
            component="img"
            src={techFleetLogo}
            alt="Tech Fleet"
            sx={{ width: { xs: 56, md: 88 }, height: { xs: 56, md: 88 } }}
          />
        </Box>

        {/* Right content column. */}
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            px: { xs: 3, md: 8 },
            py: { xs: 3, md: 4 },
          }}
        >
          {/* Polite live region announcing step progress (visually hidden). The runtime
              translator must skip volatile regions (TRANSLATOR-VOLATILE-003); the announced
              text is built from source strings. */}
          <Box
            aria-live="polite"
            data-no-translate
            sx={{
              position: "absolute",
              width: "1px",
              height: "1px",
              p: 0,
              m: "-1px",
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {announce}
          </Box>

          <WelcomeTopStepper total={total} activeStep={step} />

          {/* Active step content. */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", pt: { xs: 3, md: 5 } }}>
            <ActiveComponent />
          </Box>

          {/* Footer nav: Back (left), Next (right). The terminal step owns its own CTAs,
              so no generic "Next" is shown there. */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              pt: { xs: 3, md: 4 },
              minHeight: 44,
            }}
          >
            <Button
              variant="ghost"
              onClick={onBack}
              disabled={!canGoBack(step)}
              startIcon={<NavArrow dir="left" />}
              // Back stays visible on the first step but disabled (§4.2 AC — "Back is
              // disabled on the first screen"), matching the prototype footer.
              // AAA target size (WCAG 2.5.5, §12.8) for the mandatory flow.
              sx={{ minHeight: 44 }}
            >
              {WELCOME_NAV.back}
            </Button>

            {!last ? (
              <Button
                variant="ghost"
                onClick={onNext}
                endIcon={<NavArrow dir="right" />}
                sx={{ minHeight: 44 }}
              >
                {active.nextLabel ?? WELCOME_NAV.next}
              </Button>
            ) : (
              <Box aria-hidden />
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

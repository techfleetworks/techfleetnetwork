import { useEffect } from "react";
import { Box, Button } from "@/design-system";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";
import { WELCOME_COLORS } from "./welcome-colors";
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
 * ("Welcome Flow" page, 8770:8597). A soft-blue branding panel on the left carries only
 * the Tech Fleet logo; the right column holds a check-style top stepper, the active step,
 * and a footer with "Back" / "Next" arrow links. There is NO Skip or close affordance —
 * the only way out is finishing the flow (§4.2 FR-N2).
 *
 * The flow FOLLOWS the member's light/dark theme (ADR 20261115b): surfaces and text come
 * from DS tokens, the panel from WELCOME_COLORS. The unDraw line-art is black strokes on
 * transparent, so on a dark surface the illustrations are inverted (WelcomeArt) to stay
 * legible. Contrast is AA in both modes.
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
      <Box
        sx={{
          // Lock the flow to exactly the viewport height so the footer nav is always on
          // screen and the page itself never scrolls. 100dvh tracks the *dynamic* viewport
          // (mobile URL bar show/hide); fall back to 100vh where dvh is unsupported.
          height: "100vh",
          "@supports (height: 100dvh)": { height: "100dvh" },
          overflow: "hidden",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          bgcolor: "background.paper",
          color: "text.primary",
          pt: "env(safe-area-inset-top)",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Left branding panel — soft-blue (brand), Tech Fleet logo only (prototype 8873:1343).
            Follows the theme: #C2E1FF in light, a deep slate-blue in dark (WELCOME_COLORS). */}
        <Box
          sx={{
            flex: { xs: "0 0 auto", md: "0 0 33%" },
            flexShrink: 0,
            bgcolor: (theme) =>
              theme.palette.mode === "dark" ? WELCOME_COLORS.panel.dark : WELCOME_COLORS.panel.light,
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
            // Let this column's flex children shrink and own their own overflow, so the
            // footer stays pinned instead of being pushed below the fold.
            minHeight: 0,
            overflow: "hidden",
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

          <Box sx={{ flexShrink: 0 }}>
            <WelcomeTopStepper total={total} activeStep={step} />
          </Box>

          {/* Active step content — the ONLY scrollable region, so the footer below never
              leaves the viewport. On normal device sizes nothing scrolls (the illustration
              scales to the available height, §WelcomeStepColumns); on very short screens only
              this area scrolls, never the footer. */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              pt: { xs: 3, md: 5 },
            }}
          >
            <ActiveComponent />
          </Box>

          {/* Footer nav: Back (left), Next (right). The terminal step owns its own CTAs,
              so no generic "Next" is shown there. */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              pt: { xs: 2, md: 4 },
              minHeight: 44,
              // Pinned: the footer never shrinks or scrolls, so Back/Next are always visible.
              flexShrink: 0,
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
  );
}

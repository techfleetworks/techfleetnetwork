import { useEffect } from "react";
import { Box, Button, Container, MobileStepper, Stack, Text } from "@/design-system";
import { canGoBack, canGoNext, WELCOME_STEP_HEADING_ID } from "./navigation";
import { WELCOME_NAV } from "./content";
import type { WelcomeStepDef } from "./steps";

export interface WelcomeFlowShellProps {
  steps: readonly WelcomeStepDef[];
  /** 0-based index of the active step (already clamped by the caller). */
  step: number;
  onNext: () => void;
  onBack: () => void;
}

/**
 * The un-skippable, full-screen Welcome Flow shell (§13). Two columns on desktop (left
 * Tech Fleet branding panel, right content) collapsing to a single column on mobile
 * (§4.2 FR-N1). There is NO Skip or close affordance anywhere — the only way out is
 * finishing the flow (§4.2 FR-N2). Progress is a MobileStepper pinned to the footer whose
 * dot count comes from the live step registry, never a hardcoded number.
 *
 * Accessibility (§12.2/§12.3): on every step change focus moves to the step heading so
 * keyboard and screen-reader users land on the new content (WCAG 2.4.3), and a polite
 * live region announces "Step N of M: <title>" (first app usage of step semantics).
 */
export function WelcomeFlowShell({ steps, step, onNext, onBack }: WelcomeFlowShellProps) {
  const total = steps.length;
  const active = steps[step];
  const ActiveComponent = active?.Component;

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
        minHeight: "100dvh",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        pt: "env(safe-area-inset-top)",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Left branding panel — desktop only, decorative (content is duplicative of brand). */}
      <Box
        aria-hidden
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
          width: "40%",
          px: 6,
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        <Text brand="display" sx={{ color: "inherit" }}>
          Tech Fleet
        </Text>
        <Text brand="lede" sx={{ color: "inherit" }}>
          Develop real experience on empowered teams.
        </Text>
      </Box>

      {/* Right content column. */}
      <Box
        component="main"
        sx={{ flex: 1, display: "flex", flexDirection: "column", px: 2 }}
      >
        {/* Polite live region announcing step progress (visually hidden). */}
        <Box
          aria-live="polite"
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

        <Container
          maxWidth="sm"
          sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
        >
          <Stack spacing={3} sx={{ flex: 1, justifyContent: "center" }}>
            <ActiveComponent />
          </Stack>
        </Container>

        <MobileStepper
          variant="dots"
          steps={total}
          position="static"
          activeStep={step}
          sx={{ bgcolor: "transparent", justifyContent: "space-between" }}
          backButton={
            <Button
              size="sm"
              variant="ghost"
              onClick={onBack}
              disabled={!canGoBack(step)}
              // AAA target size (WCAG 2.5.5, §12.8): the DS Button is 40px tall;
              // bump to 44x44 for the mandatory flow.
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              {WELCOME_NAV.back}
            </Button>
          }
          nextButton={
            <Button
              size="sm"
              onClick={onNext}
              disabled={!canGoNext(step, total)}
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              {active.nextLabel ?? WELCOME_NAV.next}
            </Button>
          }
        />
      </Box>
    </Box>
  );
}

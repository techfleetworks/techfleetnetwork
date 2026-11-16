import { Fragment } from "react";
import { Box } from "@/design-system";

/**
 * Check-style progress indicator pinned to the top of each Welcome Flow screen
 * (Figma "Welcome Flow" prototype, node 8873:1351). One node per step: completed steps
 * are a filled dark circle with a white check, the current step is an open ringed circle,
 * upcoming steps are a light filled circle. Connector lines bridge the nodes.
 *
 * It is purely decorative: textual progress ("Step N of M: <title>") is already announced
 * by the shell's polite live region, so this is `aria-hidden` to avoid double-announcing.
 */
export interface WelcomeTopStepperProps {
  /** Total number of steps (from the live step registry, never hardcoded). */
  total: number;
  /** 0-based index of the active step. */
  activeStep: number;
}

const NODE = 36; // px — node diameter (prototype uses 40; 36 reads better at our widths)

function CheckGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 16 16"
      aria-hidden
      sx={{ width: 16, height: 16, display: "block" }}
    >
      <path
        d="M13.5 4.5 6.75 11.5 3 7.75"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Box>
  );
}

export function WelcomeTopStepper({ total, activeStep }: WelcomeTopStepperProps) {
  if (total <= 0) return null;

  return (
    <Box
      aria-hidden
      sx={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        maxWidth: 520,
      }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const done = i < activeStep;
        const current = i === activeStep;
        return (
          <Fragment key={i}>
            <Box
              sx={{
                flex: "0 0 auto",
                width: NODE,
                height: NODE,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: done ? "text.primary" : current ? "background.paper" : "grey.300",
                color: "background.paper",
                border: current ? 2 : 0,
                borderColor: "text.primary",
              }}
            >
              {done ? <CheckGlyph /> : null}
            </Box>
            {i < total - 1 ? (
              <Box
                sx={{
                  flex: 1,
                  height: "2px",
                  bgcolor: i < activeStep ? "text.primary" : "grey.300",
                }}
              />
            ) : null}
          </Fragment>
        );
      })}
    </Box>
  );
}

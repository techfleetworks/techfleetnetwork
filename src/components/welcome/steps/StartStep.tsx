import { useEffect, useRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Button, CircularProgress, Stack, Text } from "@/design-system";
import { useCompleteWelcomeFlow } from "@/hooks/use-complete-welcome-flow";
import { WELCOME_CONTENT, WELCOME_START_ROUTES } from "../content";
import { WELCOME_ASSETS } from "../assets";
import { WelcomeStepColumns, WelcomeArt } from "../WelcomeStepColumns";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (g) — Start onboarding today! (Figma 8873:1484). The flow's end. Reaching this step
 * fires the set-once completion write; the CTAs are revealed only once that write is
 * CONFIRMED (FR-g3 — never navigate on an unconfirmed write, no redirect loop). On failure
 * the member sees a retry, not a dead end. The write is idempotent, so a replay (Back then
 * forward) is safe. The prototype shows a single "Onboarding course" option plus a "Take me
 * home" CTA — no "Join Discord" (dropped to match the design). CTAs are real router links.
 */
export function StartStep() {
  const c = WELCOME_CONTENT.start;
  const art = WELCOME_ASSETS.start;
  const complete = useCompleteWelcomeFlow();

  // Fire the completion write once when the step mounts. mutate() is stable across renders.
  const firedRef = useRef(false);
  const { mutate } = complete;
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    mutate();
  }, [mutate]);

  return (
    <Stack spacing={{ xs: 4, md: 6 }}>
      <Text brand="display" id={WELCOME_STEP_HEADING_ID} tabIndex={-1} sx={{ outline: "none" }}>
        {c.heading}
      </Text>
      <WelcomeStepColumns
        main={
          <Stack spacing={3}>
            <Text brand="body">{c.body}</Text>

            {complete.isError ? (
              <Stack spacing={1.5}>
                <Alert variant="destructive" role="alert" data-no-translate>
                  {c.errorNote}
                </Alert>
                <Button fullWidth size="lg" onClick={() => complete.mutate()}>
                  {c.retry}
                </Button>
              </Stack>
            ) : !complete.isSuccess ? (
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                aria-live="polite"
                data-no-translate
              >
                <CircularProgress size={20} aria-hidden />
                <Text brand="body">{c.finishing}</Text>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Button asChild fullWidth size="lg">
                  <RouterLink to={WELCOME_START_ROUTES.onboarding}>{c.cta.onboarding}</RouterLink>
                </Button>
                <Button asChild fullWidth size="lg" variant="outline">
                  <RouterLink to={WELCOME_START_ROUTES.home}>{c.cta.home}</RouterLink>
                </Button>
              </Stack>
            )}
          </Stack>
        }
        illustration={<WelcomeArt src={art.src} alt={art.alt} />}
      />
    </Stack>
  );
}

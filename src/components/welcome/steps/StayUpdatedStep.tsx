import { useEffect, useId, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Input, Link, Stack, Switch, Text } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMarketingSubscription,
  useSetMarketingSubscription,
} from "@/hooks/use-marketing-subscription";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_ASSETS } from "../assets";
import { WelcomeStepColumns, WelcomeArt } from "../WelcomeStepColumns";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (e) — Stay Updated (newsletter, Figma 8873:1539). A Switch OFF by default (FR-e1):
 * leaving it off subscribes no one (AC-e1). Opting in records *intent* through the single
 * owner (EO is the source of truth — ADR-0017); because the list is double opt-in (P5) the
 * UI never claims "subscribed" — it points to the confirmation email.
 *
 * The email field + confirmation/consent copy appear ONLY once the switch is ON — before
 * then there is nothing to confirm, and showing an email we won't use is misleading. The
 * save-error alert is always rendered so a failed toggle (either direction) is never silent.
 */
export function StayUpdatedStep() {
  const c = WELCOME_CONTENT.stayUpdated;
  const art = WELCOME_ASSETS.stayUpdated;
  const { profile } = useAuth();
  const { data: subscribedIntent } = useMarketingSubscription();
  const setSubscription = useSetMarketingSubscription("welcome_flow");

  const labelId = useId();
  const emailId = useId();
  const [on, setOn] = useState(false);

  // Reflect the stored intent once it loads (the single source of truth, AC-e2).
  useEffect(() => {
    if (typeof subscribedIntent === "boolean") setOn(subscribedIntent);
  }, [subscribedIntent]);

  const handleToggle = (next: boolean) => {
    setOn(next); // optimistic — the switch responds immediately
    setSubscription.mutate(
      { subscribed: next },
      // Reconcile the optimistic switch if the write fails — never leave a false "on"
      // (and so the confirm note below, gated on success, never lies about a failed opt-in).
      { onError: () => setOn(!next) },
    );
  };

  return (
    <Stack spacing={{ xs: 3, md: 4 }}>
      <Text brand="display" id={WELCOME_STEP_HEADING_ID} tabIndex={-1} sx={{ outline: "none" }}>
        {c.heading}
      </Text>
      <WelcomeStepColumns
        main={
          <Stack spacing={3}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Switch
                checked={on}
                onChange={(e) => handleToggle(e.target.checked)}
                inputProps={{ role: "switch", "aria-labelledby": labelId }}
              />
              <Text id={labelId} brand="body" as="label">
                {c.toggleLabel}
              </Text>
            </Stack>

            {setSubscription.isError ? (
              <Alert variant="destructive" role="alert" data-no-translate>
                {c.saveError}
              </Alert>
            ) : null}

            {/* Email + confirmation/consent appear only when subscribing. */}
            {on ? (
              <Stack spacing={2}>
                {setSubscription.isSuccess ? (
                  <Alert variant="info" role="status" data-no-translate>
                    {c.confirmNote}
                  </Alert>
                ) : null}

                <Stack spacing={1}>
                  <Text id={emailId} brand="label" as="label">
                    {c.emailLabel}
                  </Text>
                  <Input
                    value={profile?.email ?? ""}
                    placeholder={c.emailPlaceholder}
                    readOnly
                    inputProps={{ "aria-labelledby": emailId, "aria-readonly": true }}
                  />
                </Stack>

                <Text brand="bodySmall" color="muted">
                  {c.consent}{" "}
                  <Link component={RouterLink} to="/privacy">
                    {c.privacyLinkLabel}
                  </Link>
                </Text>
              </Stack>
            ) : null}
          </Stack>
        }
        illustration={<WelcomeArt src={art.src} alt={art.alt} />}
      />
    </Stack>
  );
}

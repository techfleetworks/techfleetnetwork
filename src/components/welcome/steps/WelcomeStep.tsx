import { Stack, Text } from "@/design-system";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_ASSETS } from "../assets";
import { WelcomeStepColumns, WelcomeArt } from "../WelcomeStepColumns";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (a) — Welcome (Figma 8873:1342). The step (b) "empowered team" idea is folded into
 * the body copy (P8). No data is written here (§4.3 AC-a1). The heading carries the shared
 * focus target id so the shell can move focus to it on step change (§12.2, WCAG 2.4.3).
 */
export function WelcomeStep() {
  const { heading, body } = WELCOME_CONTENT.welcome;
  const art = WELCOME_ASSETS.welcome;

  return (
    <Stack spacing={{ xs: 4, md: 6 }}>
      <Text brand="display" id={WELCOME_STEP_HEADING_ID} tabIndex={-1} sx={{ outline: "none" }}>
        {heading}
      </Text>
      <WelcomeStepColumns
        main={<Text brand="body">{body}</Text>}
        illustration={<WelcomeArt src={art.src} alt={art.alt} />}
      />
    </Stack>
  );
}

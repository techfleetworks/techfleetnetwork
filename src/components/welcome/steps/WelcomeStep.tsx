import { Stack, Text } from "@/design-system";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_ASSETS } from "../assets";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (a) — Welcome. The step (b) "empowered team" idea is folded into the body copy
 * (P8). No data is written here (§4.3 AC-a1). The heading carries the shared focus
 * target id so the shell can move focus to it on step change (§12.2, WCAG 2.4.3).
 */
export function WelcomeStep() {
  const { heading, body } = WELCOME_CONTENT.welcome;
  const art = WELCOME_ASSETS.welcome;

  return (
    <Stack spacing={3}>
      {art.src && art.alt !== null ? (
        <img
          src={art.src}
          alt={art.alt}
          width={320}
          height={240}
          loading="lazy"
          style={{ maxWidth: "100%", height: "auto", alignSelf: "center" }}
        />
      ) : null}
      <Text
        brand="display"
        id={WELCOME_STEP_HEADING_ID}
        tabIndex={-1}
        sx={{ outline: "none" }}
      >
        {heading}
      </Text>
      <Text brand="body">{body}</Text>
    </Stack>
  );
}

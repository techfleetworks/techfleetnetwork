import { Stack, Text } from "@/design-system";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_ASSETS } from "../assets";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (c) — Why it's helpful. The five items are DISPLAY-ONLY, not selectable inputs
 * (§4.5 AC-c1 — no data is written). Rendered as a semantic list so a screen reader
 * announces "list, 5 items". The heading carries the shared focus-target id (§12.2).
 */
export function WhyItsHelpfulStep() {
  const { heading, items } = WELCOME_CONTENT.whyItsHelpful;
  const art = WELCOME_ASSETS.whyItsHelpful;

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
      <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", m: 0, pl: 0 }}>
        {items.map((item) => (
          <Text key={item} as="li" brand="body">
            {item}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}

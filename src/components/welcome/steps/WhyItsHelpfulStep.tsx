import { Box, Stack, Text } from "@/design-system";
import { WELCOME_CONTENT } from "../content";
import { WELCOME_ASSETS, WELCOME_SPIRAL_BULLET } from "../assets";
import { WelcomeStepColumns, WelcomeArt } from "../WelcomeStepColumns";
import { WELCOME_STEP_HEADING_ID } from "../navigation";

/**
 * Step (c) — Why it's helpful (Figma 8873:1381). The five items are DISPLAY-ONLY, not
 * selectable inputs (§4.5 AC-c1 — no data is written). Rendered as a semantic list so a
 * screen reader announces "list, 5 items"; the spiral markers are decorative. The heading
 * carries the shared focus-target id (§12.2).
 */
export function WhyItsHelpfulStep() {
  const { heading, listHeading, items } = WELCOME_CONTENT.whyItsHelpful;
  const art = WELCOME_ASSETS.whyItsHelpful;

  return (
    <Stack spacing={{ xs: 3, md: 4 }}>
      <Text brand="display" id={WELCOME_STEP_HEADING_ID} tabIndex={-1} sx={{ outline: "none" }}>
        {heading}
      </Text>
      <WelcomeStepColumns
        main={
          <Stack spacing={2}>
            <Text brand="label">{listHeading}</Text>
            <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", m: 0, pl: 0 }}>
              {items.map((item) => (
                <Box
                  key={item}
                  component="li"
                  sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
                >
                  <Box
                    component="img"
                    src={WELCOME_SPIRAL_BULLET}
                    alt=""
                    aria-hidden
                    sx={{ width: 32, height: 32, flex: "0 0 auto" }}
                  />
                  <Text brand="body">{item}</Text>
                </Box>
              ))}
            </Stack>
          </Stack>
        }
        illustration={<WelcomeArt src={art.src} alt={art.alt} />}
      />
    </Stack>
  );
}

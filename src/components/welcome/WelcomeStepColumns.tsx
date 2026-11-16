import type { ReactNode } from "react";
import { Box } from "@/design-system";

/**
 * The per-step content layout shared by the Welcome Flow screens (Figma prototype): the
 * step's main content on the left and an optional decorative illustration on the right,
 * collapsing to a single column (illustration below) on mobile. The illustration wrapper
 * is `aria-hidden` because every illustration in the flow is decorative — the `<img alt>`
 * inside already carries any needed text.
 */
export function WelcomeStepColumns({
  main,
  illustration,
}: {
  main: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: { xs: 3, md: 5 },
        alignItems: { xs: "stretch", md: "flex-start" },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>{main}</Box>
      {illustration ? (
        <Box
          aria-hidden
          sx={{
            flex: "0 0 auto",
            width: { xs: "66%", sm: 240, md: 300 },
            alignSelf: "center",
          }}
        >
          {illustration}
        </Box>
      ) : null}
    </Box>
  );
}

/** Decorative illustration image, sized to its column; lazy-loaded. */
export function WelcomeArt({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{ width: "100%", height: "auto", display: "block" }}
    />
  );
}

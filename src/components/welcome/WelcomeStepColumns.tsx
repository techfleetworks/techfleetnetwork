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
            width: { xs: "58%", sm: 240, md: 300 },
            // Cap the art to a fraction of the viewport height so it scales DOWN on short
            // screens instead of pushing the footer off-screen — the key to fitting any
            // device without scroll. The <img> inside is `contain`-scaled to this box.
            maxHeight: { xs: "24vh", sm: "32vh", md: "48vh" },
            alignSelf: "center",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {illustration}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Decorative illustration image, sized to its column and capped to a fraction of the
 * viewport height so it scales down on short screens (keeps the footer on screen).
 *
 * The unDraw art is black line-art whose light areas are transparent, so it only reads on a
 * light surface. In DARK mode the flow's surface is dark, so the art is inverted (black
 * strokes become light) to stay legible — the flow now follows the user's theme.
 */
export function WelcomeArt({ src, alt }: { src: string; alt: string }) {
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      loading="lazy"
      sx={{
        display: "block",
        mx: "auto",
        width: "auto",
        height: "auto",
        maxWidth: "100%",
        maxHeight: { xs: "24vh", sm: "32vh", md: "48vh" },
        filter: (theme) => (theme.palette.mode === "dark" ? "invert(1)" : "none"),
      }}
    />
  );
}

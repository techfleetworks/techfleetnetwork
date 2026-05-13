# Tech Fleet typography

Brand Visual Guide §3 mandates **Futura PT Bold** for headings and **Poppins Regular** for body text.

## Implementation

- Body: `Poppins` self-hosted via `@fontsource/poppins` (400/500/600).
- Display: `Futura PT` first, then **Jost** (free Futura-equivalent) as
  near-universal fallback, then Poppins, then Inter, then system sans.
- Tailwind exposes `font-sans` (Poppins) and `font-display` (Futura PT/Jost).

## Licensing gap

Futura PT is a paid Adobe/Linotype face. Until Tech Fleet acquires a
production licence, **Jost** ships as the rendering fallback. Jost is an
open-source geometric sans built explicitly as a Futura alternative; the
silhouette is close enough that most readers will not notice the swap.

**Backlog**: license Futura PT for web (`Adobe Fonts` or self-host) and add
the `@font-face` block. No code change will be needed beyond uploading the
files — the Tailwind stack already lists Futura PT first.

## Type scale (target — guide §3 table)

| Token        | Component         | Size (rem) | Px  |
| ------------ | ----------------- | ---------- | --- |
| Display      | (hero)            | 4.0        | 64  |
| H1           | `<PageTitle/>`    | 3.0        | 48  |
| H2           | `<SectionTitle/>` | 2.25       | 36  |
| H3           | `<SubsectionTitle/>` | 1.5     | 24  |
| H4           | (card title)      | 1.25       | 20  |
| Body L       | `<Lede/>`         | 1.125      | 18  |
| Body         | `<Body/>`         | 1.0        | 16  |
| Body S       | (helper text)     | 0.875      | 14  |
| Caption      | `<Muted/>`        | 0.75       | 12  |

Line-height fixed at 110% across the scale.

## Documented deviations

- **Letter spacing 1.2em** (per the guide table) is treated as a documentation
  typo. 1.2em letter-spacing would render words as disconnected glyphs and
  break readability + WCAG. We use `tracking-tight` (≈ -0.025em) on display
  and `tracking-normal` on body. If the brand team confirms 1.2em is
  intentional, revisit.
- **Inter** remains in the fallback stack so Storybook/snapshots stay
  deterministic when fontsource hasn't loaded yet.

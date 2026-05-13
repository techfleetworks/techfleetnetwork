# Imagery Backlog — Brand Visual Guide v1

Audit of every raster/vector in `src/assets/` and `public/images/`. Tag = keep | replace | review.

## src/assets

| Asset | Tag | Notes |
|---|---|---|
| badge-discord-learning.png | keep | On-brand badge art |
| badge-first-steps.png | keep | |
| badge-observer.png | keep | |
| badge-project-training.png | keep | |
| badge-projects.png | keep | |
| badge-second-steps.png | keep | |
| badge-third-steps.png | keep | |
| badge-volunteer.png | keep | |
| courses-complete-celebration.* | review | Should align with sage gradient (Primary Blue → Growth Green); replace with engraving-style art when illustrator is available |
| discord-username-{desktop,mobile,settings}.jpg | keep | Functional product screenshots — alt copy mandatory |
| fleety-icon.png | keep | Brand mascot |
| hero-space.* | keep | Deep Space Navy aesthetic matches brand baseline |
| quest-empty-state.* | review | Convert to Family-2 engraving with brand-mint line color |
| tech-fleet-logo.svg | keep | Canonical mark |

## public/images

| Asset | Tag | Notes |
|---|---|---|
| control-center.svg | keep | Quest UI chrome |
| controls-bg.svg | keep | |
| landscape.svg | keep | |
| off-button.svg / on-button.svg | keep | |
| quest-center-tv.svg / quest-tv.svg | keep | |
| screen-overlay.svg | keep | |
| screws.svg | keep | |

## Rules

1. Every `<img>` must carry `alt` (decorative → `alt=""`). Enforced by `jsx-a11y/alt-text: error`.
2. Hero/celebration art: sage gradient (`--gradient-sage`) or Family-2 engraving on Deep Space Navy.
3. No staged stock photography. Replace via `imagegen` using the brand palette.
4. Stock-photo replacement candidates are tagged `review` above; ship in a follow-up PR with new art committed under `src/assets/`.

## Backlog (not blockers)

- [ ] Re-illustrate `courses-complete-celebration` in Family-1 Sketch-Fill style.
- [ ] Re-illustrate `quest-empty-state` in Family-2 Engraving style with `--brand-mint`.
- [ ] Procure Futura PT commercial license (currently fall back to Jost).

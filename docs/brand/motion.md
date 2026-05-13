# Tech Fleet motion

Brand Visual Guide §7.6 — motion is purposeful, never decorative.

## Standard durations

| Token                 | Value | Use                                        |
| --------------------- | ----- | ------------------------------------------ |
| `duration-quick`      | 150ms | Hover states, focus rings, button presses  |
| `duration-standard`   | 200ms | Menus opening, tooltips, sheet/drawer slide |
| `duration-emphasized` | 300ms | Modal entry, page-level transitions        |

Anything longer than 300ms requires a code comment justifying the
duration. Looping animations require `@media (prefers-reduced-motion:
no-preference)` guards — the global guard in `index.css` already
short-circuits all transitions when the user opts out, but explicit
no-preference blocks make intent clear.

## Easing

Default `ease-in-out` (Tailwind `ease-in-out`). Avoid bounce / elastic
curves — they read as decorative.

## Reduced motion

Respected globally via the `@media (prefers-reduced-motion: reduce)` block
in `src/index.css` which clamps every animation/transition to 1ms. No
component should override this without explicit accessibility review.

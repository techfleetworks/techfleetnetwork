Fix: tighten the responsive hero typography so it cannot exceed its container on tablets and large phones.

- Reduce the `Display` clamp from `clamp(2rem, 5vw, 3.5rem)` to something like `clamp(1.875rem, 4vw, 3rem)` so mid-width screens render a sane size.
- Add `break-words` / `[overflow-wrap:anywhere]` on the hero heading as a safety net.
- Apply the same easing to `PageTitle` and `SectionTitle` clamps so other pages don't clip either.
- No layout, color, or content changes.
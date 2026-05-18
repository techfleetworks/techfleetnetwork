# Stop the hero image pop-in on the landing page

## Why it's happening
The world/sun/rocket images aren't tiny — combined they're **~360 KB**:
- `world.svg` 179 KB (oversized SVG, likely embedded raster)
- `sun.svg` 20 KB
- `rocket.png` 157 KB

The browser parses HTML, then JS, then *finally* requests the images, so the hero column renders empty and then snaps in. The 1.5s fade made it worse because it added an obvious "empty → fade" sequence.

## Plan — ship all four steps together

### 1. Revert the fade-in (done by you via History)
Remove the `motion-safe:opacity-0 motion-safe:animate-[fade-in_1.5s...]` classes from both `<img>` tags in `src/pages/LandingPage.tsx`.

### 2. Preload the hero art in `index.html`
Add to `<head>`, so the browser fetches them in parallel with JS instead of after:
```html
<link rel="preload" as="image" href="/assets/sun-[hash].svg" fetchpriority="high" type="image/svg+xml" />
<link rel="preload" as="image" href="/assets/world-[hash].svg" fetchpriority="high" type="image/svg+xml" />
```
Since Vite hashes asset names, we'll instead move `world.svg` and `sun.svg` into `public/hero/` so they have stable URLs (`/hero/world.svg`, `/hero/sun.svg`) suitable for preload links, and update the imports in `LandingPage.tsx` to reference those stable paths.

### 3. Reserve the layout box (kills the "snap")
Even with preload, a few ms can pass before bytes arrive. Add explicit `width`, `height`, and `decoding="sync"` to both hero `<img>` tags so the box is sized from the very first paint and the image renders atomically in place — no layout shift, no pop.

### 4. Shrink the assets (the real perf win)
- **`world.svg` (179 KB)** — run through SVGO; if it's a traced raster it'll stay big, in which case export a **WebP at ~40 KB** and use that instead. Same for `sun.svg` if SVGO doesn't help.
- **`rocket.png` (157 KB)** — convert to WebP (~30–50 KB) and add `loading="lazy"` (already lazy, keep it) + explicit `width`/`height` so it doesn't shift when it loads further down.

Target: hero art drops from ~200 KB to **~60 KB total**, fully cached before React mounts.

## Result
- First paint of the hero shows the image already in place (preload + sized box).
- No fade, no pop, no layout shift.
- Landing page LCP improves measurably (tracked by your existing Web Vitals RUM).

## Out of scope
- No changes to copy, layout, or theme-swap logic.
- No animation libraries.
- No changes to `NetworkActivity` lazy loading (already correct).

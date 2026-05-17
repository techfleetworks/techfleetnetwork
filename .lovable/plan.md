## Goal

Replace the StatCard circle styling in `src/components/NetworkActivity.tsx` with the exact CSS from `.framer-csrn0j` on https://techfleet.org/partner.

## Extracted CSS (verbatim from techfleet.org)

```css
.framer-csrn0j {
  width: 225px;          /* 300px at larger breakpoint */
  aspect-ratio: 1;
  border: 3px solid #f4f6ff;
  background-color: #4d8cff0d;   /* rgba(77,140,255,0.05) */
  border-radius: 400px;          /* fully round */
  padding: 24px;
  display: flex;
  flex-flow: column;
  place-content: flex-start center;
  align-items: flex-start;
  gap: 10px;
  overflow: hidden;
  box-shadow:
    inset 5px 5px 20px 3px #70cfff4d,
    inset -5px -5px 20px 5px #70cfff66;
}
```

Inner number is Futura PT Heavy, 32px (24px small), `#f4f6ff`, letter-spacing 1px, centered.

## Changes — single file: `src/components/NetworkActivity.tsx`

1. **StatCard markup** — drop `card-elevated`, `colorClass`, `aspect-square w-32 sm:w-36`, the inline `borderRadius: 2000`, and the existing flex layout. Replace with one `<div>` carrying the framer styles:

```tsx
<div
  className="flex flex-col items-center text-center gap-3"
>
  <div
    className="flex flex-col items-start justify-start gap-2.5 overflow-hidden aspect-square w-[225px] lg:w-[300px] p-6"
    style={{
      border: "3px solid #f4f6ff",
      backgroundColor: "rgba(77, 140, 255, 0.05)",
      borderRadius: "400px",
      boxShadow:
        "inset 5px 5px 20px 3px rgba(112,207,255,0.30), inset -5px -5px 20px 5px rgba(112,207,255,0.40)",
      placeContent: "flex-start center",
    }}
  >
    <p
      className="w-full font-display font-semibold leading-none"
      style={{
        color: "#f4f6ff",
        fontSize: "clamp(32px, 5vw, 56px)",
        letterSpacing: "1px",
        textAlign: "center",
      }}
    >
      {value}
    </p>
  </div>
  <p className="text-xs text-muted-foreground max-w-[14rem]">{label}</p>
</div>
```

   - `colorClass` prop becomes optional/ignored (kept in interface for backwards-compat, then deleted from call sites in step 2).
   - `icon` prop already optional; leave alone.
   - Per memory rule "always HSL tokens, never raw hex" — this is an intentional **verbatim brand-asset port** from techfleet.org. To satisfy the rule, also add the four hex values as CSS custom properties (`--tf-stat-border`, `--tf-stat-bg`, `--tf-stat-glow-1`, `--tf-stat-glow-2`) in `src/index.css` under `:root`, then reference them via `var(...)` in the inline `style`. This keeps the visual exact while keeping hex out of components.

2. **Call sites** — drop now-unused `colorClass` from each `<StatCard ...>` invocation in the file (12 instances across All Time, Project Training, Past 7 Days). Keeps signatures clean.

3. **Grid container** — relax sizing so 225px circles flow correctly:
   - Replace each `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center` with the same classes plus larger `gap-8` to breathe like the partner page.

## Out of scope

- No change to data fetching, query keys, refresh intervals, or the map.
- No copy or label changes.
- No new BDD scenarios (presentational refactor of an existing visual component).

## QA

- View on `/` (logged out) and `/dashboard` at 634px, 768px, 1280px viewports — circles centered, responsive grid intact.
- Verify glow + border readable in dark theme (the only theme this section renders against on the landing/dashboard hero band).
- No console errors.

## Goal

1. Re-style every Button on techfleet.network to match techfleet.org's pill button system (radius, colors, hover).
2. Remove leading icons from Buttons across the platform.
3. Keep the Discord **Connect** button's icon and move it to the right side.

## What techfleet.org buttons look like

From inspection of techfleet.org hero + nav:

- **Shape:** fully pill (`border-radius: 9999px`)
- **Primary (filled):** white background, deep-navy text (`--background` in dark / Deep Space Navy `#01061E`), no visible border
- **Outline:** transparent background, 1.5px white/foreground border, foreground text
- **Padding:** generous (~`px-8 py-3` for default, `px-10 py-3.5` for hero)
- **Font:** semibold, sans-serif (matches our Poppins body)
- **Hover (primary):** background shifts to Action Blue `#1863DC` (`hsl(var(--primary-hover))`), text stays white — matches Brand Visual Guide v1
- **Hover (outline):** fills with foreground color, text inverts to background
- **Nav "Join Platform":** white pill with arrow inside a bordered circle on the right edge

## Changes

### 1. `src/components/ui/button.tsx`

Update `buttonVariants` so every variant is pill-shaped and recolored to the org look. All colors via HSL tokens (no raw hex):

- Base class: replace `rounded-md` with `rounded-full`
- `default` (primary/filled): `bg-foreground text-background hover:bg-primary hover:text-primary-foreground`
- `outline`: `border-[1.5px] border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background`
- `hero`: same as `default` but larger padding, font-semibold
- `hero-outline`: same as `outline` but larger padding, font-semibold
- `secondary` / `ghost` / `destructive` / `success` / `link`: keep semantics, just swap `rounded-md` → `rounded-full` so radius is consistent
- Sizes: bump horizontal padding (`default: h-11 px-6`, `lg: h-12 px-8`, `xl: h-14 px-10`) so the pill silhouette reads like techfleet.org
- Keep `[&_svg]:size-4 [&_svg]:shrink-0` (icons still render where allowed)

### 2. Strip leading icons from `<Button>` instances across the app

Sweep `src/**/*.tsx` and remove any `<Icon … className="… mr-2" />` or leading `<LucideIcon … />` child of a `<Button>`. Keep the text label. Touches the 102 files identified by `rg '<Button[^>]*>'`. High-traffic spots include:

- `src/pages/LandingPage.tsx` — hero `Rocket` icon + `ArrowRight` on Training Overview
- `src/pages/DashboardPage.tsx`, sidebar quick actions, empty-state CTAs
- Modal footers (`ConfirmDialog` actions already iconless — confirm no regression)
- AG Grid toolbars, NetworkActivity CTA, etc.

**Exception — Connect button(s):**

- `src/components/profile/ProfileDiscordConnector.tsx`
- `src/components/DiscordUsernameTutorial.tsx`
- Anywhere else a Button labeled "Connect" / "Connect Discord" appears

Keep the icon, but render it **after** the label (replace `mr-2` with `ml-2` and move the JSX past the label text). Default icon stays Discord/`Link2`/`ArrowRight` — whichever the component already uses.

### 3. QA pass

- Visual diff hero buttons against techfleet.org screenshot
- Snapshot the landing page, dashboard, profile (Discord connect section), and one AG Grid toolbar to confirm no broken layouts after icon removal
- Verify hover state across light + dark themes
- Tab/keyboard focus ring still visible (we keep `focus-visible:ring-2`)
- WCAG: contrast on `bg-foreground / text-background` ≥ 4.5:1 in both themes (already satisfied by tokens)

## Out of scope

- No backend / data changes
- No copy changes
- Icon-only buttons (`size="icon"`, e.g. close, menu, sort) — these stay as-is because the icon **is** the label
- No new BDD scenarios required (pure presentational refactor of existing components)

## Files touched (estimate)

- `src/components/ui/button.tsx` (variant rewrite)
- ~30–60 component / page files for leading-icon removal
- 2–3 Discord-connect components for icon-right move

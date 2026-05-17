## Goal

Replicate the EXACT CSS from `.framer-1dba239` (primary) and `.framer-1m8ay15` (secondary) on https://techfleet.org/partner. The current `rounded-full` + Action Blue hover approach is wrong — the real Framer buttons use **asymmetric corners** (only top-left + bottom-right rounded) and different colors.

## Exact CSS extracted from techfleet.org/partner

**Primary — `.framer-1dba239` ("Apply as a Client"):**
```css
background-color: #f4f6ff;          /* off-white */
border-top-left-radius: 8px;
border-top-right-radius: 0;
border-bottom-right-radius: 8px;
border-bottom-left-radius: 0;
height: 40px;
padding: 20px 30px;
gap: 10px;
display: flex;
place-content: center;
align-items: center;
text-decoration: none;
box-shadow:
  0.398096px 0.398096px 0.562993px -0.9375px #0000002e,
  1.20725px 1.20725px 1.70731px -1.875px #0000002b,
  3.19133px 3.19133px 4.51322px -2.8125px #00000026,
  10px 10px 14.1421px -3.75px #0000000f,
  0 2px 4px #00000040;
/* text */
font-family: Poppins, sans-serif;
font-size: 20px;
font-weight: 700;
letter-spacing: 1px;
color: rgb(51, 51, 51);
```

**Secondary — `.framer-1m8ay15` ("Download Info Sheet"):**
```css
background-color: #01061e;          /* Deep Space Navy */
border: 1px solid #f4f6ff;
border-top-left-radius: 8px;
border-top-right-radius: 0;
border-bottom-right-radius: 8px;
border-bottom-left-radius: 0;
height: 40px;
padding: 15px;
gap: 12px;
display: flex;
place-content: center;
align-items: center;
text-decoration: none;
/* text */
font-family: Poppins, sans-serif;
font-size: 20px;
font-weight: 400;
letter-spacing: 1px;
color: #f4f6ff;
```

Hover: techfleet.org's button hover is Framer JS-driven (no CSS `:hover` rule was found in the page). I'll add a subtle, on-brand hover (slight `translate-y-[-1px]` + shadow lift on primary; bg lightens to `#0a1130` on secondary) — purely cosmetic, matches Framer's default "lift" feel. If you want literally no hover, say so and I'll drop it.

## Changes

### 1. `src/components/ui/button.tsx`

Rewrite `buttonVariants` so the **default + hero variants = Framer primary** and **outline + secondary variants = Framer secondary**. Use HSL tokens added to `index.css` (no raw hex in components).

- `default` / `hero`: bg `--tf-btn-primary-bg` (#f4f6ff), text `--tf-btn-primary-fg` (rgb 51,51,51), asymmetric radius (`rounded-tl-lg rounded-br-lg rounded-tr-none rounded-bl-none`), `h-10 px-[30px] py-5`, Framer box-shadow, `font-bold tracking-[1px] text-[20px]`, hover `-translate-y-[1px]` + stronger shadow.
- `outline` / `secondary`: bg `--tf-btn-secondary-bg` (#01061e), border `1px solid --tf-btn-primary-bg`, text `--tf-btn-primary-bg`, same asymmetric radius, `h-10 p-[15px]`, `tracking-[1px] text-[20px]`, hover bg lightens.
- `ghost` / `link`: keep current (not techfleet partner buttons).
- `size="icon"`: keep `rounded-md` (unchanged).
- Mobile: scale font down via responsive class (e.g. `text-base sm:text-[20px]`) to avoid wrap on small screens.

### 2. `src/index.css`

Add tokens under `:root` (and dark equivalents where they differ — both modes use the same brand button colors):
```css
--tf-btn-primary-bg: 230 100% 98%;     /* #f4f6ff */
--tf-btn-primary-fg: 0 0% 20%;         /* rgb(51,51,51) */
--tf-btn-secondary-bg: 230 78% 6%;     /* #01061e */
--tf-btn-shadow: 0.4px 0.4px 0.56px -0.94px #0000002e, 1.21px 1.21px 1.71px -1.88px #0000002b, 3.19px 3.19px 4.51px -2.81px #00000026, 10px 10px 14.14px -3.75px #0000000f, 0 2px 4px #00000040;
```
Reference shadow via `var(--tf-btn-shadow)` in `button.tsx` inline `style` (Tailwind can't express it cleanly).

### 3. Out of scope

- No changes to call sites — variants stay the same, only their look changes.
- `ProfileDiscordConnector.tsx` connect button keeps its right-side icon (per earlier instruction).
- No data, behavior, accessibility (focus ring stays), or test changes.

## What I will NOT do (until confirmed)

- Won't change `NetworkActivity` circles.
- Won't touch any non-button styling.
- Won't add new dependencies.

Approve and I'll ship it.
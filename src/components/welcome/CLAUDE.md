# Rules for the Welcome Flow (scoped — loads when working here)

The mandatory, un-skippable Welcome Flow. It gates ~50 authenticated routes for ~767 production
users, so a mistake here locks people out of the whole app. Full spec:
`docs/onboarding/welcome-flow-technical-requirements.md`. Decisions: ADR 20261009-welcome-flow-gate
/ -data-model / -eo-extension. The base `src/components/CLAUDE.md` rules (no data access, no
business math in JSX, writes through services) still apply — these add to them.

## Design system only — never shadcn, never lucide

```tsx
// ❌ never — shadcn ui or lucide-react in the welcome dir (greenfield; no legacy excuse)
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

// ✅ always — TechFleet Design System + the DS SvgIcon atom / brand SVG assets
import { Button, SvgIcon } from "@/design-system";
```

Enforced in two places (both block merge): the ESLint block in `eslint.config.js` scoped to
`src/components/welcome/**` + `src/pages/WelcomePage.tsx`, and the arch-gate rule "Welcome Flow
builds on the design system only". Brand only — no greyscale, no raw hex, no system font (§13).

## `welcome_flow_completed_at` has exactly one writer

```ts
// ❌ never — a second writer of the completion fact (breaks set-once; ADR-0050 two-writer class)
await profileService.updateFields({ welcome_flow_completed_at: new Date().toISOString() });
const payload = { welcome_flow_completed_at: now };

// ✅ always — set once, server-side, through the single owner
await profileService.markWelcomeFlowComplete(); // → mark_welcome_flow_complete() RPC, COALESCE set-once
const done = profile.welcome_flow_completed_at != null; // reads (dot access) are fine
```

`welcome_flow_completed_at` must never be in the generic `updateFields` allow-list. Enforced by the
arch-gate rule "welcome_flow_completed_at has exactly one writer".

## SVGs are URL imports, never SVGR components

```tsx
// ❌ never — SVGR (this repo has no SVGR; it would add a build dependency)
import { ReactComponent as Hero } from "@/assets/welcome-flow/hero.svg";

// ✅ always — URL import + <img alt> (like src/pages/DashboardPage.tsx)
import hero from "@/assets/welcome-flow/hero.svg";
<img src={hero} alt="Two teammates building together" />;
```

Illustrations are the unDraw-style SVGs from Figma (node 8770:8597), exported to
`src/assets/welcome-flow/`, SVGO-optimized. Enforced by the arch-gate rule "Welcome Flow imports
SVGs as URLs, never via SVGR".

## The completion-count stat is live-derived, never a stored counter

```ts
// ❌ never — a stored/incremented counter table (freezes + drifts; ADR-0050)
await supabase.from("welcome_flow_stats").update({ total: total + 1 });

// ✅ always — count at read time via the owning RPC (requirements §6.13)
supabase.rpc("get_welcome_flow_completion_count");
```

Enforced by the live-stat arch-gate rule (`welcome_flow_stats` is in its forbidden set).

## The gate must never trap or bypass

The route gate is a three-state decision — loading → spinner, profile-read-failed → retry (never
redirect, never bypass), known-null completion → redirect to `/welcome`. There is **no feature
flag** (flagless 100% launch, §11.2). Build the gate OUTSIDE the frozen auth layer
(`src/features/auth/**`, `src/lib/auth/**`, `main.tsx`, the Supabase client). No Skip/close
affordance anywhere; buttons vertically stacked; shell is `100dvh` + safe-area.

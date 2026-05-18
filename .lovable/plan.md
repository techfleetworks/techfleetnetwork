Update `src/components/ui/tabs.tsx` to increase visual separation between active and inactive tabs (applies app-wide):

- `TabsList`: keep `bg-muted` but switch inactive text to `text-muted-foreground/80` → `text-foreground/60`, add subtle `border border-border` for the rail definition.
- `TabsTrigger` inactive state: `text-foreground/60`, `hover:text-foreground hover:bg-background/50` for clear affordance.
- `TabsTrigger` active state: swap `bg-background` → `bg-primary`, `text-foreground` → `text-primary-foreground`, strengthen `shadow-sm` → `shadow-md`, add `font-bold` (was `font-semibold`).

Result: active tab uses Tech Fleet Blue with white text (WCAG AAA contrast vs muted rail), inactive tabs sit at 60% foreground — clearly recessive but still readable. No component-level overrides needed; existing tab usages inherit automatically.

No business logic changes. Tokens only (HSL semantic), no raw hex.
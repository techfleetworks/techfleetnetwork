# Tech Fleet iconography

Brand Visual Guide §4 specifies **Feather Icons** at 2px stroke, rounded
caps, 24px standard / 16px micro.

## Implementation

We ship **lucide-react** — a Feather-derived, actively maintained library.
Same visual language, same 2px stroke, same rounded caps. Treating lucide as
an in-spec replacement.

## Canonical wrapper

Always render icons through `<Icon icon={...} />` from
`src/components/ui/icon.tsx`. The wrapper enforces:

- 24px UI default, 16px micro variant for in-button use.
- `currentColor` inheritance — never set raw colors on the SVG.
- `aria-hidden` automatically when paired with text.
- `aria-label` required when the icon is the only content of an interactive
  element.

```tsx
import { Icon } from "@/components/ui/icon";
import { Plus, X } from "lucide-react";

// In a button with text — icon is decorative
<Button><Icon icon={Plus} size="micro" /> New project</Button>

// Standalone icon button — must have a label
<Button variant="ghost" size="icon">
  <Icon icon={X} label="Close dialog" />
</Button>
```

## Color rules

Icons inherit text color by default. Standalone interactive icons (no
adjacent label) may use `text-primary` to signal interactivity. Never use
arbitrary HEX values.

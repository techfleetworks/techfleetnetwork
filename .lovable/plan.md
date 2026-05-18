The font is still huge because two things are stacking together:

1. The global REM scale still grows on desktop/tablet (`html` becomes 17–19px).
2. The hero `Display` text uses large fixed REM sizes (`2.5rem → 4rem`), so it becomes even larger as REM increases.

Plan:
- Keep REM stable and readable across breakpoints instead of increasing it aggressively.
- Make the hero headline use viewport-safe `clamp()` sizing so it cannot blow up on preview, tablet, or desktop.
- Slightly reduce page/section heading scales if needed so the whole site feels balanced, not just the home hero.
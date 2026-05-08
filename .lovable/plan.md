## Goal

Today users can Alt+Click anything navigational to force-open it in a new tab. That covers mouse users but not keyboard-only users. This plan adds a true **keyboard shortcut** that opens whatever link is currently focused (or, for mouse users, currently hovered) in a new tab — works on every link in the platform without per-page wiring.

## Shortcut

- **Primary:** `Alt+Enter` (Option+Return on macOS)
  - Native `Cmd/Ctrl+Enter` on a focused `<a href>` already opens a background tab — we keep that working untouched.
  - `Alt+Enter` extends the same behavior to **buttons-as-links** (sidebar items, cards, step-progress nodes, anything with `data-href`) where the browser does nothing today.
- **Mouse-friendly twin:** `Alt+Shift+O` opens the link currently under the cursor (last hovered `<a>` / `[data-href]`). Useful when the user isn't tabbing.
- Discoverability: press **`?`** (Shift+/) anywhere outside an input to open a shortcut cheatsheet dialog.

## Scope of "link"

Same resolver as the existing Alt+Click handler (`src/lib/alt-click-new-tab.ts`):
1. `<a href>` (covers all React Router `<Link>`s).
2. Any element with `data-href` (opt-in for navigational `<button>`s).
3. `role="link"` elements with `href` or `data-href`.

Skips: `mailto:`, `tel:`, `sms:`, `javascript:`, downloads, and anything already `target="_blank"`.

## Changes

### 1. `src/lib/alt-click-new-tab.ts` → rename to `src/lib/force-new-tab.ts`

- Extract `resolveHref` and `findNavTarget` into reusable exports.
- Keep the existing capture-phase click listener (no behavior change).
- Add a `keydown` listener:
  - On `Alt+Enter`: find the nearest nav target by walking up from `document.activeElement`. If found, `window.open(href, "_blank", "noopener,noreferrer")` and `preventDefault`.
  - Ignore the shortcut while focus is in an `<input>`, `<textarea>`, `[contenteditable]`, or any element with `role="textbox"` (so it doesn't hijack form typing).
- Add a `mousemove` listener (passive, throttled via `requestAnimationFrame`) that records the last hovered nav target in a module-level ref. `Alt+Shift+O` reads from it.
- Rename the installer to `installForceNewTab()` and update the import in `src/main.tsx`.

### 2. New `src/components/ShortcutCheatsheet.tsx`

- Mounted once in `AppLayout` (all three branches).
- Global `keydown` listener for `?` (Shift+/) — gated by the same input-focus check.
- Renders a shadcn `<Dialog>` listing every shortcut:
  - `Alt+Enter` — open focused link in new tab
  - `Alt+Shift+O` — open hovered link in new tab
  - `Alt+Click` — open clicked link in new tab
  - `Cmd/Ctrl+K` — universal search
  - `Esc` — close dialogs
  - `?` — toggle this cheatsheet
- Themed with existing semantic tokens, JetBrains Mono for the key chips, 100dvh-safe scroll on mobile, full keyboard trap + `aria-modal`.
- Footer link "More accessibility info →" routes to `/accessibility`.

### 3. Visible focus ring on nav targets

- No new component CSS needed — current `focus-visible` styles already pass WCAG 2.4.7. We will add one utility line in `index.css` to ensure `[data-href]` buttons get the same focus ring as anchors, so the shortcut's "what's focused" answer is unambiguous.

### 4. BDD scenarios (`bdd_scenarios`, area: Navigation)

Tri-layer Then-clauses per project rule:

- `KBD-NEWTAB-001` — Tab to a sidebar link, press Alt+Enter → [UI] new browser tab opens at that route, current tab unchanged; [DB] no writes; [Code] `window.open` called once with `_blank,noopener,noreferrer`.
- `KBD-NEWTAB-002` — Focus a `data-href` button (e.g. a project card), press Alt+Enter → same as 001.
- `KBD-NEWTAB-003` — Focus inside a `<textarea>`, press Alt+Enter → newline inserted, no tab opens (handler bails on editable focus).
- `KBD-NEWTAB-004` — Hover a link, move focus elsewhere, press Alt+Shift+O → hovered link opens in new tab.
- `KBD-NEWTAB-005` — Press `?` outside any input → cheatsheet dialog appears, focus trapped, Esc closes it.
- `KBD-NEWTAB-006` — Press `?` while typing in the search box → character typed normally, dialog does not open.
- `KBD-NEWTAB-007` — `mailto:` / `tel:` / download link focused, press Alt+Enter → handler no-ops, native behavior preserved.

## Out of scope

- No remapping UI (shortcuts are fixed; cheatsheet is read-only).
- No change to existing Alt+Click behavior — only additions.
- No change to Cmd/Ctrl+K universal search (already shipped).

## Technical notes

- One file (`force-new-tab.ts`) owns all "force new tab" logic — click + keyboard + hover share the same resolver, so coverage stays consistent.
- The hover ref is cleared on `mouseleave` of the document and on route change, so stale targets don't leak across pages.
- All listeners are installed once from `main.tsx`; no per-page wiring; zero bundle cost on routes that don't use it.
- Cheatsheet uses existing shadcn `Dialog` — no new deps.

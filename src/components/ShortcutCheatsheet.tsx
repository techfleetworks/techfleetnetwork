import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";

/**
 * Global keyboard-shortcut cheatsheet.
 *
 * Press `?` (Shift+/) anywhere outside an editable surface to toggle.
 * Mounted once per AppLayout branch.
 */

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const t = el.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
  const r = el.getAttribute("role");
  return r === "textbox" || r === "combobox" || r === "searchbox";
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Alt", "Enter"], label: "Open the focused link in a new tab" },
  { keys: ["Alt", "Shift", "O"], label: "Open the hovered link in a new tab" },
  { keys: ["Alt", "Click"], label: "Open the clicked link in a new tab" },
  { keys: ["⌘/Ctrl", "K"], label: "Universal search" },
  { keys: ["?"], label: "Toggle this cheatsheet" },
  { keys: ["Esc"], label: "Close dialogs and menus" },
];

export function ShortcutCheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Speed up navigation across Tech Fleet Network.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2" role="list">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-4 rounded-md border border-border bg-card/40 px-3 py-2"
            >
              <span className="text-sm text-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="font-mono text-[11px] leading-none rounded border border-border bg-muted px-1.5 py-1 text-muted-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="pt-2 text-xs text-muted-foreground">
          Need an accommodation?{" "}
          <Link
            to="/accessibility"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            Visit the accessibility page →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

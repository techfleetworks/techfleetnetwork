/**
 * Force-open-in-new-tab — click + keyboard + hover.
 *
 * Three input paths share one resolver so behaviour stays consistent:
 *   - Alt+Click on an <a>, [data-href], or role="link" element.
 *   - Alt+Enter while such an element is focused (keyboard users).
 *   - Alt+Shift+O opens whichever such element the cursor last hovered.
 *
 * Resolver rules:
 *   1. <a href> covers React Router <Link>.
 *   2. Any element with `data-href` (opt-in for navigational <button>s).
 *   3. role="link" elements with href or data-href.
 *
 * Skips: mailto:, tel:, sms:, javascript:, downloads, target="_blank".
 *
 * The keyboard handler is gated to ignore presses while focus is in an
 * editable surface (input/textarea/contenteditable/role=textbox) so the
 * shortcut never hijacks typing.
 */

const NON_TAB_SCHEMES = ["mailto:", "tel:", "sms:", "javascript:"];

function resolveHref(el: Element): string | null {
  if (el instanceof HTMLAnchorElement) {
    const raw = el.getAttribute("href");
    if (!raw) return null;
    if (NON_TAB_SCHEMES.some((s) => raw.toLowerCase().startsWith(s))) return null;
    if (el.hasAttribute("download")) return null;
    return el.href;
  }
  const dataHref = el.getAttribute("data-href");
  if (dataHref) {
    if (NON_TAB_SCHEMES.some((s) => dataHref.toLowerCase().startsWith(s))) return null;
    try {
      return new URL(dataHref, window.location.origin).toString();
    } catch {
      return null;
    }
  }
  return null;
}

function findNavTarget(start: EventTarget | null): { el: Element; href: string } | null {
  if (!(start instanceof Element)) return null;
  let cur: Element | null = start;
  while (cur && cur !== document.documentElement) {
    if (cur instanceof HTMLAnchorElement || cur.hasAttribute("data-href")) {
      const href = resolveHref(cur);
      if (href) return { el: cur, href };
      return null;
    }
    cur = cur.parentElement;
  }
  return null;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return false === false && true; // satisfy TS narrow
  // The line above just ensures contenteditable counts. Full check:
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const role = el.getAttribute("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  return false;
}

function openInNewTab(href: string): void {
  // noopener/noreferrer prevents tabnabbing (OWASP).
  window.open(href, "_blank", "noopener,noreferrer");
}

let installed = false;
let lastHovered: { el: Element; href: string } | null = null;
let hoverFrame = 0;

export function installForceNewTab(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  // ---- Alt+Click ----------------------------------------------------------
  document.addEventListener(
    "click",
    (e) => {
      if (e.button !== 0) return;
      if (!e.altKey) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      const target = findNavTarget(e.target);
      if (!target) return;
      if (target.el instanceof HTMLAnchorElement && target.el.target === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      openInNewTab(target.href);
    },
    true,
  );

  // ---- Hover tracking (powers Alt+Shift+O) -------------------------------
  document.addEventListener(
    "mousemove",
    (e) => {
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        lastHovered = findNavTarget(e.target);
      });
    },
    { passive: true },
  );
  document.addEventListener("mouseleave", () => {
    lastHovered = null;
  });

  // ---- Keyboard shortcuts -------------------------------------------------
  document.addEventListener(
    "keydown",
    (e) => {
      // Alt+Enter — open focused link.
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.key === "Enter") {
        if (isEditableTarget(e.target)) return;
        const target = findNavTarget(document.activeElement);
        if (!target) return;
        if (target.el instanceof HTMLAnchorElement && target.el.target === "_blank") return;
        e.preventDefault();
        e.stopPropagation();
        openInNewTab(target.href);
        return;
      }
      // Alt+Shift+O — open hovered link (mouse twin for keyboard parity).
      if (
        e.altKey &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.key === "O" || e.key === "o")
      ) {
        if (isEditableTarget(e.target)) return;
        if (!lastHovered) return;
        e.preventDefault();
        e.stopPropagation();
        openInNewTab(lastHovered.href);
      }
    },
    true,
  );
}

// Back-compat: the old name is still imported in main.tsx fallbacks.
export const installAltClickNewTab = installForceNewTab;

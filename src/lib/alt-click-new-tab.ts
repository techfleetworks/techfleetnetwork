/**
 * Alt+Click force-open-in-new-tab.
 *
 * Pressing Alt (Option on macOS) while clicking any in-app navigational
 * element opens the destination in a new tab, even if the element is a
 * <button> that uses React Router's navigate() under the hood.
 *
 * What we treat as "navigational":
 *   1. A real <a href> — covers React Router <Link> (renders an <a>).
 *   2. Any element with a `data-href` attribute (escape hatch for buttons
 *      that navigate programmatically — opt-in).
 *   3. role="link" elements with an `href` or `data-href`.
 *
 * Notes:
 *   - We never intercept clicks that already carry Cmd/Ctrl/Shift modifiers
 *     so the browser's own new-tab/new-window behavior wins.
 *   - We use capture-phase so we run before React Router's click handler,
 *     which is how we beat its preventDefault.
 *   - External links (different origin or http(s) absolute) are simply opened
 *     in a new tab the same way — Alt+Click should always open new tab.
 *   - We honor `target="_blank"` (already opens new tab) and skip downloads,
 *     mailto:, tel:, and javascript: schemes.
 */

const NON_TAB_SCHEMES = ["mailto:", "tel:", "sms:", "javascript:"];

function resolveHref(el: Element): string | null {
  if (el instanceof HTMLAnchorElement) {
    const raw = el.getAttribute("href");
    if (!raw) return null;
    if (NON_TAB_SCHEMES.some((s) => raw.toLowerCase().startsWith(s))) return null;
    if (el.hasAttribute("download")) return null;
    return el.href; // absolute, browser-resolved
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
  // Walk up to find an anchor or [data-href] container.
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

let installed = false;

export function installAltClickNewTab(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  document.addEventListener(
    "click",
    (e) => {
      // Only main-button clicks with Alt held, no other modifiers that the
      // browser already maps to new-tab/new-window behaviour.
      if (e.button !== 0) return;
      if (!e.altKey) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;

      const target = findNavTarget(e.target);
      if (!target) return;

      // If the anchor already targets _blank, the browser will handle it.
      if (target.el instanceof HTMLAnchorElement && target.el.target === "_blank") return;

      e.preventDefault();
      e.stopPropagation();
      // noopener/noreferrer = SOC 2 / OWASP best practice (prevents tabnabbing).
      window.open(target.href, "_blank", "noopener,noreferrer");
    },
    // Capture phase so we beat React Router's onClick which calls preventDefault.
    true,
  );
}

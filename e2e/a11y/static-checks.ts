/**
 * Static repo-wide WCAG checks. Run ONCE per audit (not per route) by
 * grepping the project source. They cover criteria that are about how
 * the codebase is structured rather than per-page rendered DOM.
 *
 * Each check returns:
 *   { status: "pass" | "fail" | "needs_review", details?: string, evidence?: string[] }
 *
 * Add a check here, then reference its key from `wcag-checklist.ts`.
 *
 * Implementation notes:
 *  - Uses node:fs + a simple recursive walker. We deliberately avoid
 *    adding new deps to the test toolchain.
 *  - "needs_review" is the right status when we find suspicious patterns
 *    that may or may not be a real violation in context.
 */

import { promises as fs } from "node:fs";
import { join, relative } from "node:path";

export type StaticStatus = "pass" | "fail" | "needs_review";
export interface StaticResult {
  status: StaticStatus;
  details?: string;
  evidence?: string[];
}

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const INDEX_HTML = join(ROOT, "index.html");

interface FileSnapshot {
  path: string;
  content: string;
}

async function walk(dir: string, exts: string[], acc: FileSnapshot[] = []): Promise<FileSnapshot[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, exts, acc);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      try {
        const content = await fs.readFile(full, "utf8");
        acc.push({ path: relative(ROOT, full), content });
      } catch {
        // Skip unreadable files.
      }
    }
  }
  return acc;
}

let _srcCache: FileSnapshot[] | null = null;
async function getSrcFiles(): Promise<FileSnapshot[]> {
  if (!_srcCache) _srcCache = await walk(SRC, [".ts", ".tsx", ".css"]);
  return _srcCache;
}

function findInFiles(files: FileSnapshot[], pattern: RegExp, max = 10): string[] {
  const hits: string[] = [];
  for (const f of files) {
    if (pattern.test(f.content)) {
      const lines = f.content.split("\n");
      lines.forEach((line, i) => {
        if (pattern.test(line) && hits.length < max) {
          hits.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 160)}`);
        }
      });
    }
    if (hits.length >= max) break;
  }
  return hits;
}

export const STATIC_CHECKS: Record<string, () => Promise<StaticResult>> = {
  "no-shape-color-only-instructions": async () => {
    const files = await getSrcFiles();
    // Heuristic: instructions like "click the green button" / "see the
    // shape on the right" — flag for review. We can't decide automatically.
    const evidence = findInFiles(files, /\b(green|red|yellow|blue)\s+(button|icon|link|circle|box)|\bsee\s+(above|below|right|left)\b|\bon\s+the\s+(right|left)\b/i, 10);
    return evidence.length
      ? { status: "needs_review", details: `${evidence.length} string(s) reference color/shape/position only — verify they include text alternatives.`, evidence }
      : { status: "pass" };
  },

  "no-orientation-lock-css": async () => {
    const files = await getSrcFiles();
    const evidence = findInFiles(files, /@media\s*\([^)]*orientation\s*:\s*(portrait|landscape)[^)]*\)\s*\{[^}]*display\s*:\s*none/i, 10);
    return evidence.length
      ? { status: "fail", details: "Found CSS that hides content based on orientation (locks the user).", evidence }
      : { status: "pass" };
  },

  "no-fixed-px-in-meta-viewport": async () => {
    let html = "";
    try { html = await fs.readFile(INDEX_HTML, "utf8"); } catch { return { status: "needs_review", details: "index.html not readable." }; }
    const m = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
    if (!m) return { status: "fail", details: "No viewport meta tag found." };
    const tag = m[0];
    if (/maximum-scale\s*=\s*1/i.test(tag) || /user-scalable\s*=\s*no/i.test(tag)) {
      return { status: "fail", details: "Viewport meta disables user-scaling.", evidence: [tag] };
    }
    return { status: "pass", details: tag };
  },

  "single-char-shortcuts-have-modifier-or-toggle": async () => {
    const files = await getSrcFiles();
    // Look for keydown handlers comparing e.key to a single printable char
    // without checking ctrlKey/metaKey/altKey.
    const evidence: string[] = [];
    for (const f of files) {
      const re = /e(?:vent)?\.key\s*===?\s*['"]([a-z0-9])['"]/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content)) && evidence.length < 10) {
        const ctx = f.content.slice(Math.max(0, m.index - 200), m.index + 200);
        if (!/(ctrlKey|metaKey|altKey|shiftKey)/.test(ctx) && !/input|textarea|contenteditable/i.test(ctx)) {
          evidence.push(`${f.path}: shortcut "${m[1]}" without modifier — verify it can be remapped or disabled.`);
        }
      }
    }
    return evidence.length
      ? { status: "needs_review", details: `${evidence.length} single-char shortcut(s) detected.`, evidence }
      : { status: "pass" };
  },

  "session-timeout-warns-and-extends": async () => {
    const files = await getSrcFiles();
    // We have an idle-timeout system; verify the warn-then-extend path exists.
    const hasIdle = files.some((f) => /idle.?timeout/i.test(f.path) || /IDLE_(TIMEOUT|WARNING)/.test(f.content));
    const hasWarn = files.some((f) => /idle.*warning|extend.*session|stay.*signed.?in/i.test(f.content));
    if (hasIdle && hasWarn) return { status: "pass", details: "Idle-timeout warning + extension path detected." };
    if (hasIdle) return { status: "needs_review", details: "Idle timeout exists but no clear warning/extension UI detected." };
    return { status: "pass", details: "No client-side timing limits enforced." };
  },

  "no-flashing-animations": async () => {
    const files = await getSrcFiles();
    // CSS animations with very short duration + infinite iteration are
    // candidates for flash. We flag for review; final judgement is visual.
    const evidence = findInFiles(files, /animation(?:-duration)?\s*:\s*0?\.[0-2]\d*s[^;]*infinite|animation\s*:[^;]*0?\.[0-2]\d*s[^;]*infinite/i, 10);
    return evidence.length
      ? { status: "needs_review", details: "Short-duration infinite animations found — verify <3 flashes/sec.", evidence }
      : { status: "pass" };
  },

  "site-has-search-and-nav": async () => {
    const files = await getSrcFiles();
    const hasSearch = files.some((f) => /UniversalSearch|CommandDialog|cmdk/i.test(f.content));
    const hasNav = files.some((f) => /AppSidebar|MainNav|Sidebar.*nav/i.test(f.content));
    return hasSearch && hasNav
      ? { status: "pass", details: "Universal search + persistent nav detected." }
      : { status: "needs_review", details: `search=${hasSearch}, nav=${hasNav}` };
  },

  "focus-visible-styles-present": async () => {
    const files = await getSrcFiles();
    const hits = files.filter((f) => f.path.endsWith(".css") && /:focus-visible/.test(f.content));
    const tailwind = files.some((f) => /focus-visible:/.test(f.content));
    return hits.length || tailwind
      ? { status: "pass", details: `Focus-visible styles found in ${hits.length} CSS file(s)${tailwind ? " + Tailwind utilities" : ""}.` }
      : { status: "fail", details: "No :focus-visible styles or Tailwind focus-visible utilities detected." };
  },

  "no-multipoint-or-path-only-gestures": async () => {
    const files = await getSrcFiles();
    const evidence = findInFiles(files, /\b(onPinch|onSwipe|pinchZoom|HammerJS|GestureRecognizer)\b/, 10);
    return evidence.length
      ? { status: "needs_review", details: "Multi-point/path gestures detected — verify single-pointer alternative exists.", evidence }
      : { status: "pass" };
  },

  "actions-fire-on-pointerup": async () => {
    const files = await getSrcFiles();
    // Flag onMouseDown/onPointerDown handlers that look destructive.
    const evidence = findInFiles(files, /on(?:Mouse|Pointer)Down\s*=\s*\{[^}]*(submit|delete|remove|destroy|navigate|signOut)/i, 10);
    return evidence.length
      ? { status: "needs_review", details: "Destructive actions on pointerdown — should fire on pointerup with cancel option.", evidence }
      : { status: "pass" };
  },

  "motion-has-alternative-control": async () => {
    const files = await getSrcFiles();
    const evidence = findInFiles(files, /\b(DeviceMotion|DeviceOrientation|requestPermission.*motion)\b/, 10);
    return evidence.length
      ? { status: "needs_review", details: "Motion APIs in use — verify a non-motion alternative is available.", evidence }
      : { status: "pass" };
  },

  "drag-has-single-pointer-alternative": async () => {
    const files = await getSrcFiles();
    const evidence = findInFiles(files, /\b(react-beautiful-dnd|@dnd-kit|onDragStart|draggable=\{true\})\b/, 10);
    return evidence.length
      ? { status: "needs_review", details: `${evidence.length} drag interaction(s) — verify each has a click/keyboard alternative.`, evidence }
      : { status: "pass" };
  },

  "no-onfocus-context-change": async () => {
    const files = await getSrcFiles();
    // onFocus that triggers navigation/submit/openModal — context change.
    const evidence = findInFiles(files, /onFocus\s*=\s*\{[^}]*(navigate|router\.push|window\.location|submit|openModal|setOpen\s*\(\s*true)/, 10);
    return evidence.length
      ? { status: "needs_review", details: "onFocus appears to change context — should require explicit user action.", evidence }
      : { status: "pass" };
  },

  "no-onchange-auto-submit": async () => {
    const files = await getSrcFiles();
    const evidence = findInFiles(files, /onChange\s*=\s*\{[^}]*\.submit\s*\(\)/, 10);
    return evidence.length
      ? { status: "needs_review", details: "onChange auto-submits a form — should use a submit button.", evidence }
      : { status: "pass" };
  },

  "consistent-nav-shell": async () => {
    const files = await getSrcFiles();
    const layouts = files.filter((f) => /AppLayout|RootLayout|MainLayout/.test(f.path));
    return layouts.length
      ? { status: "pass", details: `${layouts.length} shared layout component(s) provide consistent nav.` }
      : { status: "needs_review", details: "No shared layout file detected." };
  },

  "consistent-component-naming": async () => {
    // True 3.2.4 compliance is observable across pages; we proxy via
    // existence of a shared design system (shadcn/ui under src/components/ui).
    try {
      const dir = await fs.readdir(join(SRC, "components", "ui")).catch(() => [] as string[]);
      return dir.length > 5
        ? { status: "pass", details: `${dir.length} shared UI components — consistent identification likely.` }
        : { status: "needs_review", details: `Only ${dir.length} shared components detected.` };
    } catch {
      return { status: "needs_review", details: "components/ui directory not found." };
    }
  },

  "consistent-help-mechanism": async () => {
    const files = await getSrcFiles();
    // Look for a persistent help affordance (Fleety chatbot, Help link).
    const hasHelp = files.some((f) => /\b(Fleety|HelpButton|\/?help|FloatingHelp)\b/i.test(f.content));
    return hasHelp
      ? { status: "pass", details: "Persistent help mechanism (Fleety / Help link) detected." }
      : { status: "fail", details: "No persistent help mechanism detected across pages." };
  },

  "form-errors-include-suggestions": async () => {
    const files = await getSrcFiles();
    // Heuristic: presence of zod-based validation surfaces machine-readable
    // messages we render via FormMessage. Spot-check a handful.
    const usesZod = files.some((f) => /from\s+["']zod["']/.test(f.content));
    const usesFormMessage = files.some((f) => /FormMessage/.test(f.content));
    return usesZod && usesFormMessage
      ? { status: "pass", details: "Forms use Zod schemas + <FormMessage>, which surface specific suggestions." }
      : { status: "needs_review", details: `zod=${usesZod}, FormMessage=${usesFormMessage}` };
  },

  "destructive-actions-have-confirm": async () => {
    const files = await getSrcFiles();
    const usesConfirm = files.some((f) => /AlertDialog|ConfirmDialog|window\.confirm\(/.test(f.content));
    return usesConfirm
      ? { status: "pass", details: "Confirmation dialog patterns are in use." }
      : { status: "fail", details: "No confirmation dialog component detected." };
  },

  "forms-do-not-re-ask-known-data": async () => {
    const files = await getSrcFiles();
    // Best signal we can give without runtime: presence of profile-prefill
    // helpers and shared form defaults.
    const evidence = files.filter((f) => /defaultValues\s*[:=]\s*\{[^}]*profile|prefill|usePrefill/i.test(f.content)).slice(0, 5).map((f) => f.path);
    return evidence.length
      ? { status: "pass", details: `${evidence.length} form(s) prefill from existing profile data.`, evidence }
      : { status: "needs_review", details: "Could not detect prefill patterns automatically — verify forms reuse known data." };
  },

  "no-cognitive-only-auth-without-alternative": async () => {
    const files = await getSrcFiles();
    const hasOAuth = files.some((f) => /signInWithOAuth|google|signin.*google/i.test(f.content));
    const hasPasskey = files.some((f) => /passkey|webauthn/i.test(f.content));
    const hasCaptcha = files.some((f) => /captcha|hcaptcha|recaptcha|cloudflare.*turnstile/i.test(f.content));
    if (hasCaptcha && !hasOAuth && !hasPasskey) {
      return { status: "fail", details: "Captcha detected with no OAuth/passkey alternative — fails 3.3.8." };
    }
    return { status: "pass", details: `OAuth=${hasOAuth}, passkey=${hasPasskey}, captcha=${hasCaptcha}` };
  },
};

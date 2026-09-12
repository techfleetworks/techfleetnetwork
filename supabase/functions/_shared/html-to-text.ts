// HTML → plain text — the SINGLE owner for turning (untrusted) rich-text / email
// HTML into content we only ever use as TEXT: preview snippets, embedding /
// prompt input, and email/Discord plain-text parts. The mirror of escape-html.ts
// (which goes text → safe HTML); this goes HTML → safe text.
//
// WHY THIS EXISTS — do not hand-roll another tag-stripper (arch-gate forbids it,
// rule `edge-hand-rolled-html-strip`):
//   • A single-pass `.replace(/<[^>]*>/g, "")` is bypassable by nested
//     reconstruction — `<scr<script>ipt>` → `<script>` after one pass
//     (CodeQL js/incomplete-multi-character-sanitization). We strip with a
//     FIXPOINT (re-apply until the string stops changing).
//   • A naive `<script>.*?</script>` misses `>` inside attributes and odd
//     spacing (CodeQL js/bad-tag-filter). We use a TEMPERED pattern that
//     matches the whole element regardless of attribute contents.
//   • Ad-hoc entity decoding double-unescapes — `&amp;lt;` → `<`
//     (CodeQL js/double-escaping). We decode `&amp;` LAST so it becomes the
//     literal text `&lt;`, never an active `<`.
//
// OUTPUT IS ALWAYS PLAIN TEXT. Never insert the result into an HTML sink. HTML
// that will be rendered AS HTML must be sanitized on the client with the
// DOMPurify allow-list (src/lib/security.ts#sanitizeHtml).

// Tempered pattern for a paired element: matches `<tag ...> ... </tag>` even when
// `>` appears inside a quoted attribute, and regardless of spacing before the
// close. Robust against js/bad-tag-filter (unlike `<tag[^>]*>[\s\S]*?</tag>`).
function elementPattern(tag: string): RegExp {
  return new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}[\\s>])<[^<]*)*<\\/${tag}\\s*>`, "gi");
}

const NON_TEXT_ELEMENTS = ["script", "style", "template", "noscript"] as const;

// Remove script/style-type element BODIES so their contents don't leak as text.
// Inline loop-until-stable (NOT an abstracted helper) so CodeQL recognizes the
// sanitization as complete — the documented remedy for
// js/incomplete-multi-character-sanitization.
function removeElements(html: string, tags: readonly string[]): string {
  let out = html;
  let prev = "";
  while (out !== prev) {
    prev = out;
    for (const tag of tags) out = out.replace(elementPattern(tag), " ");
  }
  return out;
}

// Convert block-level structure to line breaks BEFORE stripping, for callers that
// want readable multi-line text (email / Discord). Single-line callers collapse
// it away afterwards.
function structuralBreaks(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|blockquote|tr)\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li\s*>/gi, "\n");
}

// Strip every remaining tag. Inline loop-until-stable defeats
// `<scr<script>ipt>`-style nesting AND is recognized by CodeQL as complete
// sanitization (an abstracted loop helper is not).
function stripTags(input: string): string {
  let out = input;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

// Decode entities: numeric first, then common named ones, and `&amp;` LAST so a
// double-escaped `&amp;lt;` decodes to the literal text `&lt;`, never to `<`.
function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&(nbsp|lt|gt|quot|apos|#39);/gi, (_, n) => NAMED_ENTITIES[n.toLowerCase()] ?? " ")
    .replace(/&amp;/gi, "&");
}

export interface HtmlToTextOptions {
  /** Keep paragraph/list structure as line breaks (email/Discord). Default: single line. */
  preserveLineBreaks?: boolean;
  /** Hard cap on input length to bound work (DoS guard). Default 100_000. */
  maxLength?: number;
}

/**
 * Extract plain text from HTML. Strips ALL markup (fixpoint), so the result is
 * safe to use anywhere text is expected. Use for previews, email/Discord
 * plain-text parts, and embedding input built from HTML fields.
 */
export function htmlToPlainText(
  html: string | null | undefined,
  opts: HtmlToTextOptions = {}
): string {
  if (!html) return "";
  const { preserveLineBreaks = false, maxLength = 100_000 } = opts;
  const capped = html.length > maxLength ? html.slice(0, maxLength) : html;
  let out = removeElements(capped, NON_TEXT_ELEMENTS);
  if (preserveLineBreaks) out = structuralBreaks(out);
  out = stripTags(out);
  out = decodeEntities(out);
  if (preserveLineBreaks) {
    return out
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Remove ALL HTML while PRESERVING surrounding markdown/text — for content that
 * keeps its markdown formatting and is never an HTML sink (AI chat output
 * rendered by react-markdown; admin markdown re-embedded into a prompt).
 *
 * Design note: it strips every tag (so `<script>`, event handlers, and any
 * `on*=`/`javascript:` inside a tag go with it) rather than trying to surgically
 * remove only the "active" bits while keeping other HTML — a partial HTML
 * sanitizer is exactly what CodeQL (rightly) distrusts, and neither caller needs
 * raw HTML preserved (markdown syntax like `#`/`**` is not HTML and survives).
 * Dangerous URL schemes that can appear as bare text are then neutralized.
 * This is defense-in-depth; react-markdown (no raw-HTML rendering) is the primary
 * XSS control. When you also want entities decoded / whitespace collapsed, use
 * htmlToPlainText instead.
 */
export function stripActiveContent(input: string | null | undefined): string {
  if (!input) return "";
  // Drop script/style BODIES first so their contents don't remain as text, then
  // strip every tag (both are inline loop-until-stable → CodeQL-complete).
  let out = stripTags(removeElements(input, NON_TEXT_ELEMENTS));
  // Neutralize dangerous URL schemes that can survive as bare text. Inline loop
  // so split reconstruction like `javasjavascript:cript:` cannot survive.
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out
      .replace(/javascript\s*:/gi, "")
      .replace(/vbscript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "");
  }
  return out;
}

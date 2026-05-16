/**
 * Custom ESLint plugin: enforces cross-browser CSS portability rules
 * already documented in the [CSS Universal Browser Support] memory:
 *
 *   - `no-h-screen`     — flag `h-screen`/`min-h-screen`/`max-h-screen`
 *                         Tailwind classes. They map to `100vh`, which is
 *                         broken on iOS Safari (the URL bar collapses).
 *                         Use `min-h-[100dvh]` with a `@supports` fallback.
 *
 *   - `no-vh-units`     — flag literal `100vh` / `100svh` in className
 *                         strings or inline `style={{ height: "100vh" }}`.
 *                         Use `dvh` with `@supports` fallback.
 *
 * Suppression: add `// css-portability-allow: <reason>` on the line above
 * to opt out (e.g. for the global CSS reset file).
 */

function isSuppressed(context, node) {
  const sourceCode = context.getSourceCode();
  const before = sourceCode.getCommentsBefore(node);
  return before.some((c) => /css-portability-allow:/i.test(c.value));
}

const H_SCREEN_RE = /\b(?:min-|max-)?h-screen\b/;
const VH_LITERAL_RE = /\b100(?:s|l)?vh\b/;

function checkStringLiteral(context, node, value, ruleId) {
  if (typeof value !== "string") return;
  if (ruleId === "no-h-screen" && H_SCREEN_RE.test(value)) {
    if (isSuppressed(context, node)) return;
    context.report({
      node,
      message:
        "Avoid h-screen / min-h-screen / max-h-screen — 100vh is broken on iOS Safari. " +
        "Use `min-h-[100dvh]` (with a vh fallback via @supports in index.css). " +
        "Suppress with `// css-portability-allow: <reason>` if intentional.",
    });
  }
  if (ruleId === "no-vh-units" && VH_LITERAL_RE.test(value)) {
    if (isSuppressed(context, node)) return;
    context.report({
      node,
      message:
        "Avoid raw 100vh/100svh/100lvh — they regress on iOS/Android. " +
        "Use 100dvh with a vh `@supports not (height: 100dvh)` fallback. " +
        "Suppress with `// css-portability-allow: <reason>` if intentional.",
    });
  }
}

function makeRule(ruleId, description) {
  return {
    meta: {
      type: "problem",
      docs: { description },
      schema: [],
      messages: {},
    },
    create(context) {
      return {
        Literal(node) {
          checkStringLiteral(context, node, node.value, ruleId);
        },
        TemplateElement(node) {
          checkStringLiteral(context, node, node.value?.cooked ?? "", ruleId);
        },
        JSXAttribute(node) {
          if (!node.value) return;
          if (node.value.type === "Literal") {
            checkStringLiteral(context, node, node.value.value, ruleId);
          }
        },
      };
    },
  };
}

export default {
  rules: {
    "no-h-screen": makeRule(
      "no-h-screen",
      "Disallow Tailwind h-screen / min-h-screen / max-h-screen (iOS Safari 100vh regression).",
    ),
    "no-vh-units": makeRule(
      "no-vh-units",
      "Disallow literal 100vh / 100svh / 100lvh in className or style strings.",
    ),
  },
};

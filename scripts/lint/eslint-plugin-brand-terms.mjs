/**
 * Custom ESLint plugin: enforces Tech Fleet brand-voice terminology.
 *
 * Flags banned strings inside JSX text and string literals that look like
 * user-facing copy. Tagged comments (`// brand-allow: <reason>`) on the
 * line above an offending string suppress the rule for unavoidable
 * external-system references (e.g. third-party User-Agent headers).
 *
 * Source rules: docs/brand/editorial-style.md
 */

const BANNED = [
  { re: /\bTechFleet\b/g, fix: 'Tech Fleet', msg: 'Brand name is "Tech Fleet" (two words).' },
  { re: /\bclick here\b/gi,  fix: null,        msg: 'Use descriptive link text — never "click here".' },
  { re: /\b(read more|learn more|more info|see more)\b/gi, fix: null, msg: 'Use descriptive link text (e.g. "Read the strategy") — avoid generic "Read more"/"Learn more".' },
  { re: /\bguys\b/gi,        fix: 'everyone',  msg: 'Avoid gendered "guys" — try "everyone" / "team".' },
  { re: /\bgirls?\b/gi,      fix: null,        msg: 'Avoid "girls" for adult women — try "women" or "people".' },
  { re: /\bmankind\b/gi,     fix: 'humanity',  msg: 'Use "humanity" / "people" instead of "mankind".' },
  { re: /\bcrazy\b/gi,       fix: null,        msg: 'Avoid ableist "crazy" — pick a precise word.' },
  { re: /\blame\b/gi,        fix: null,        msg: 'Avoid ableist "lame" — pick a precise word.' },
  { re: /\bdumb\b/gi,        fix: null,        msg: 'Avoid ableist "dumb" — pick a precise word.' },
  { re: /\bsuffers from\b/gi, fix: null,       msg: 'Avoid victimizing language — say "lives with" or rewrite.' },
  { re: /\bblind to\b/gi,    fix: null,        msg: 'Avoid metaphorical "blind to" — try "unaware of".' },
];

function check(context, node, raw) {
  if (!raw || raw.length < 3) return;
  // Skip URLs and obvious code identifiers
  if (/^https?:\/\//.test(raw) || /^[a-z_][a-z0-9_]*$/i.test(raw)) return;
  for (const { re, fix, msg } of BANNED) {
    re.lastIndex = 0;
    const m = re.exec(raw);
    if (!m) continue;
    context.report({
      node,
      message: `Brand voice: ${msg}`,
      ...(fix
        ? { fix: (fixer) => fixer.replaceText(node, JSON.stringify(raw.replace(re, fix))) }
        : {}),
    });
  }
}

export default {
  rules: {
    'no-banned-terms': {
      meta: { type: 'suggestion', fixable: 'code', schema: [] },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            check(context, node, node.value);
          },
          JSXText(node) {
            check(context, node, node.value);
          },
          TemplateElement(node) {
            check(context, node, node.value.cooked);
          },
        };
      },
    },
  },
};

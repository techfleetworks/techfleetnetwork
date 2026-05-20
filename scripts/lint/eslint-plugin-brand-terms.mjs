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

// Errors — block CI.
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
  { re: /\bservant[- ]leadership\b/gi, fix: 'service leadership', msg: 'Tech Fleet uses "service leadership", not "servant leadership".' },
  { re: /\bservant leaders?\b/gi,       fix: 'service leader',    msg: 'Tech Fleet uses "service leader(s)", not "servant leader(s)".' },
];

// Warnings — surface but don't block. Context is hard to detect so we
// flag for human review rather than auto-fix.
const WARNINGS = [
  {
    re: /\busers\b/g,
    msg: 'Brand voice: prefer "members" or "people who use the platform" over "users" in user-facing copy.',
  },
  {
    re: /\bblind\b(?!\s+(spot|date))/gi,
    msg: 'Brand voice: avoid "blind" as a metaphor or adjective; rewrite or say "person with vision impairment".',
  },
  {
    re: /\bteam practices\b/g,
    msg: 'Brand voice: capitalize "Team Practices" when referring to the Tech Fleet program.',
  },
  {
    re: /\bblack\b(?=\s+(communit|people|members?|woman|women|man|men|youth))/g,
    msg: 'Brand voice: capitalize "Black" when describing race or community.',
  },
  {
    re: /\bdeaf\b(?=\s+(communit|culture|people|members?))/g,
    msg: 'Brand voice: capitalize "Deaf" when referring to the Deaf community.',
  },
];

// Path-based allow-list: skip "users" warning in code paths where the term
// is a system identifier (database, auth, types, supabase generated code,
// admin/devtools surfaces that mirror DB tables).
const USERS_PATH_ALLOWLIST = [
  /\/integrations\/supabase\//,
  /\/supabase\/functions\//,
  /\/services\/.*auth/i,
  /\/contexts\/AuthContext/,
  /\/types?\//,
  /\.d\.ts$/,
  /\/admin\/(roster|users|user-admin|activity-log)/i,
  /UserAdminPage/,
];

function pathAllowsUsersTerm(filename) {
  if (!filename) return false;
  return USERS_PATH_ALLOWLIST.some((re) => re.test(filename));
}

function check(context, node, raw) {
  if (!raw || raw.length < 3) return;
  // Skip URLs and obvious code identifiers
  if (/^https?:\/\//.test(raw) || /^[a-z_][a-z0-9_]*$/i.test(raw)) return;

  const filename = context.getFilename ? context.getFilename() : context.filename;

  for (const { re, fix, msg } of BANNED) {
    re.lastIndex = 0;
    if (!re.exec(raw)) continue;
    context.report({
      node,
      message: `Brand voice: ${msg}`,
      ...(fix
        ? { fix: (fixer) => fixer.replaceText(node, JSON.stringify(raw.replace(re, fix))) }
        : {}),
    });
  }

  for (const { re, msg } of WARNINGS) {
    re.lastIndex = 0;
    if (!re.exec(raw)) continue;
    // Path-based suppression for the "users" warning only.
    if (msg.includes('"users"') && pathAllowsUsersTerm(filename)) continue;
    context.report({ node, message: msg });
  }
}

// JSX anchors whose only visible text is "here" violate the descriptive-link
// rule even though the word alone wouldn't trip the BANNED list.
const ANCHOR_TAGS = new Set(['a', 'A', 'Link', 'NavLink']);
function checkAnchor(context, node) {
  const tagName = node.openingElement?.name?.name;
  if (!tagName || !ANCHOR_TAGS.has(tagName)) return;
  const text = (node.children || [])
    .map((c) => {
      if (c.type === 'JSXText') return c.value;
      if (c.type === 'Literal' && typeof c.value === 'string') return c.value;
      if (c.type === 'JSXExpressionContainer' && c.expression?.type === 'Literal') {
        return String(c.expression.value ?? '');
      }
      return '';
    })
    .join('')
    .trim()
    .toLowerCase();
  if (text === 'here' || text === 'click here' || text === 'read more' || text === 'learn more') {
    context.report({
      node,
      message: 'Brand voice: link text must describe the destination — never bare "here"/"Read more"/"Learn more".',
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
          JSXElement(node) {
            checkAnchor(context, node);
          },
        };
      },
    },
  },
};

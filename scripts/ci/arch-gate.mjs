#!/usr/bin/env node
/**
 * arch-gate.mjs — the deterministic architecture gate.
 *
 * Fails (exit 1) when code violates the repo's structural rules. This is the MECHANICAL half of
 * the blocking architecture gate; the judge-arch skill is the review half. Zero dependencies —
 * runs anywhere Node 18+ does, in CI and locally.
 *
 *   node scripts/arch-gate.mjs                 # scan everything the config targets
 *   node scripts/arch-gate.mjs --changed       # scan only files changed vs merge-base main (PR ratchet)
 *   node scripts/arch-gate.mjs --config path --waivers path
 *
 * Config:  arch-gate.config.json   — the rules (patterns forbidden in globs) + built-in toggles
 * Waivers: arch-gate.waivers.json  — explicit, auditable, expiring exceptions (the ONLY bypass)
 *
 * Design: on CI, run with --changed so the gate blocks NEW drift without demanding an upfront
 * cleanup of the whole legacy tree. Known pre-existing hotspots go in the waivers file (with a
 * reason + expiry) so the ratchet only tightens.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const optVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};

const ROOT = process.cwd();
const CONFIG_PATH = path.resolve(ROOT, optVal("--config", "arch-gate.config.json"));
const WAIVERS_PATH = path.resolve(ROOT, optVal("--waivers", "arch-gate.waivers.json"));
const CHANGED_ONLY = flag("--changed");
const BASELINE = flag("--baseline");
const MAX_BYTES = 2 * 1024 * 1024;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);
const DEFAULT_IGNORE = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  "out",
  ".turbo",
  "playwright-report",
  "test-results",
  ".vercel",
  ".wrangler",
];

function readJson(p, fallback) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (e) {
    if (fallback !== undefined) return fallback;
    console.error(`arch-gate: cannot read ${path.relative(ROOT, p)}: ${e.message}`);
    process.exit(2);
  }
}

const config = readJson(CONFIG_PATH);
const waivers = readJson(WAIVERS_PATH, []);
const ignoreDirs = new Set([...DEFAULT_IGNORE, ...(config.ignore || [])]);

/** Minimal glob → RegExp: supports **, *, ?, and {a,b} alternation, matched against a POSIX path. */
function globToRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) re += "\\{";
      else {
        const alts = glob
          .slice(i + 1, end)
          .split(",")
          .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"));
        re += "(?:" + alts.join("|") + ")";
        i = end;
      }
    } else if (".+^$()|[]{}\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(re + "$");
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
}

function changedFiles() {
  let base = null;
  for (const b of ["origin/main", "main", "origin/master", "master"]) {
    try {
      base = sh(`git merge-base HEAD ${b}`);
      if (base) break;
    } catch {
      /* keep trying */
    }
  }
  const files = new Set();
  if (base) {
    try {
      sh(`git diff --name-only ${base}...HEAD`)
        .split("\n")
        .forEach((f) => f && files.add(f));
    } catch {
      /* ignore */
    }
  }
  try {
    sh("git diff --name-only HEAD")
      .split("\n")
      .forEach((f) => f && files.add(f));
  } catch {
    /* ignore */
  }
  return files.size ? [...files] : null;
}

function walk(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!ignoreDirs.has(e.name)) walk(path.join(dir, e.name), acc);
    } else if (e.isFile())
      acc.push(path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join("/"));
  }
  return acc;
}

const waiverMatchers = waivers.map((w) => ({ ...w, _re: w.path ? globToRegExp(w.path) : null }));
function isWaived(ruleName, file) {
  return waiverMatchers.some((w) => {
    if (w.rule !== ruleName) return false;
    if (w.expires && new Date(w.expires) < new Date()) return false;
    if (!w.path) return true;
    return w._re.test(file) || file.includes(w.path);
  });
}

const rules = (config.rules || []).map((r) => ({
  name: r.name,
  include: (r.include || []).map(globToRegExp),
  exclude: (r.exclude || []).map(globToRegExp),
  forbid: (r.forbid || []).map(
    (p) => new RegExp(p, (r.flags || "g").includes("g") ? r.flags || "g" : (r.flags || "") + "g")
  ),
}));

const builtins = Object.assign(
  { emptyCatch: true, swallowReturn: true, keepInSync: true },
  config.builtins || {}
);
const BUILTIN_CHECKS = [
  // Whitespace-only empty-catch matcher — a single `\s*` inside the braces, so
  // it is strictly linear (no nested/alternating quantifiers that can backtrack;
  // an earlier comment-aware version was CodeQL js/redos on ambiguous `/* */`
  // pairings). This deliberately does NOT match comment-only bodies
  // (`catch { /* ignore */ }`); `builtins.emptyCatch` is disabled in this repo's
  // arch-gate.config.json (error-handling judgment is left to judge-arch), so the
  // narrower match is sufficient and safe.
  [
    "emptyCatch",
    "catch block does nothing (recover, retry, or report — pick one)",
    /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
  ],
  [
    "swallowReturn",
    "catch swallows the error and returns null/false/undefined",
    /catch\s*(\([^)]*\))?\s*\{\s*return\s+(?:null|false|undefined)\s*;?\s*\}/g,
  ],
  [
    "keepInSync",
    'a "keep in sync" marker — two copies of one fact; give it one owner',
    /keep\s+(?:in|these\s+in|them\s+in|it\s+in)\s+sync/gi,
  ],
];

const matches = (regexes, file) => regexes.some((re) => re.test(file));
const violations = [];
function record(rule, file, content, regex) {
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  let m;
  while ((m = re.exec(content))) {
    const line = content.slice(0, m.index).split("\n").length;
    violations.push({
      rule,
      file,
      line,
      snippet: m[0].replace(/\s+/g, " ").trim().slice(0, 90),
      waived: isWaived(rule, file),
    });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
}

let files = CHANGED_ONLY ? changedFiles() : null;
if (!files) files = walk(ROOT, []);
// walk() prunes ignored dirs during the scan, but --changed reads git's file list directly and
// bypasses that, so apply the same pruning here: skip any file living under an ignored directory
// (a path segment in `ignore`), plus oversized or deleted files.
const isIgnoredPath = (f) => f.split("/").some((seg) => ignoreDirs.has(seg));
files = files.filter((f) => {
  if (isIgnoredPath(f)) return false;
  try {
    return fs.statSync(path.join(ROOT, f)).size <= MAX_BYTES;
  } catch {
    return false;
  }
});

for (const file of files) {
  const ext = path.extname(file);
  const applicableRules = rules.filter(
    (r) => matches(r.include, file) && !matches(r.exclude, file)
  );
  const runBuiltins = CODE_EXT.has(ext) && !ignoreDirs.has(file.split("/")[0]);
  if (!applicableRules.length && !runBuiltins) continue;
  let content;
  try {
    content = fs.readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    continue;
  }
  for (const r of applicableRules) for (const re of r.forbid) record(r.name, file, content, re);
  if (runBuiltins)
    for (const [key, label, re] of BUILTIN_CHECKS)
      if (builtins[key]) record(label, file, content, re);
}

const active = violations.filter((v) => !v.waived);
const waived = violations.filter((v) => v.waived);

// --baseline: emit a ready waiver file that grandfathers every CURRENT violation, so the gate can
// go blocking for NEW code without a big-bang cleanup. Redirect stdout into arch-gate.waivers.json.
if (BASELINE) {
  const seen = new Set();
  const out = [];
  for (const v of active) {
    const key = v.rule + " " + v.file;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rule: v.rule,
      path: v.file,
      reason: "baseline — pre-existing at gate adoption; scheduled for cleanup",
      approvedBy: "baseline",
      expires: "",
    });
  }
  console.error(
    `arch-gate --baseline: grandfathered ${out.length} pre-existing violation(s) across ${new Set(out.map((w) => w.path)).size} file(s).`
  );
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(0);
}

const byRule = new Map();
for (const v of active) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}

console.log(
  `\narch-gate — scanned ${files.length} file(s)${CHANGED_ONLY ? " (changed only)" : ""}\n`
);
if (!rules.length && !Object.values(builtins).some(Boolean)) {
  console.log("arch-gate: no rules configured and all built-ins off — nothing to enforce.");
  process.exit(0);
}
if (active.length === 0) {
  console.log(
    `PASS — no architecture violations.${waived.length ? `  (${waived.length} waived)` : ""}\n`
  );
  process.exit(0);
}
for (const [rule, list] of byRule) {
  console.log(`✖ ${rule}  (${list.length})`);
  for (const v of list.slice(0, 20)) console.log(`    ${v.file}:${v.line}   ${v.snippet}`);
  if (list.length > 20) console.log(`    …and ${list.length - 20} more`);
  console.log("");
}
if (waived.length)
  console.log(
    `(${waived.length} waived violation(s) suppressed — see ${path.basename(WAIVERS_PATH)})\n`
  );
console.error(
  `FAIL — ${active.length} architecture violation(s). Fix them, or add an explicit, expiring waiver.\n`
);
process.exit(1);

#!/usr/bin/env node
// ci-lane: critical
/**
 * EDGE-ERR-RESP-001 — an edge error response must not carry the caught error's text.
 *
 * WHY THIS EXISTS
 * ---------------
 * `error.message` / `error.stack` / `String(error)` placed in a response BODY leaks internals to the
 * client (CodeQL `js/stack-trace-exposure`; decisions.md §8). §8 said CodeQL enforced this, but there
 * is no CodeQL config in the repo and ~30 functions shipped the leak anyway (enterprise-readiness
 * audit 2026-10). The single owner is `_shared/http.ts#errorResponse`, which returns ONLY a static
 * fallback. This guard makes the leak mechanically impossible to merge: it flags a caught error's
 * `.message`/`.stack` (or `String(err)`) appearing INSIDE a `jsonResponse(...)` / `new Response(...)`
 * body — the response-construction path. It deliberately does NOT scan `errorResponse(...)` (the safe
 * owner — passing the error to it is correct) nor `console.*`/`log.*`/`logger.*` calls (logging the
 * real error is required, not a leak).
 *
 * ci-guard-integrity: bespoke-dir-reader — walks the per-function .ts files under supabase/functions
 * for response-construction spans, not a recursive src content scan, so it does not use _guard.mjs.
 * Fails CLOSED (exit 2) on a missing functions dir / zero files. Pinned by
 * src/test/smoke/check-no-error-in-edge-response.smoke.test.ts.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.EDGE_ERR_ROOT
  ? resolve(process.env.EDGE_ERR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FUNCS = resolve(ROOT, "supabase", "functions");

const die = (msg) => {
  console.error(`✖ check-no-error-in-edge-response: ${msg}`);
  process.exit(2);
};

// Collect *.ts files under supabase/functions, excluding the shared owner and tests.
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "_shared" || name === "tests" || name === "node_modules") continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...collect(p));
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

if (!existsSync(FUNCS)) die(`no supabase/functions dir at ${FUNCS}. Failing closed.`);
const files = collect(FUNCS);
if (files.length === 0) die(`scanned 0 edge function .ts files under ${FUNCS}. Failing closed.`);

// A caught error's text: `err.message` / `error.stack` on an error-ish identifier, `(x as Error).message`,
// or `String(err)`. NOT a `message:` object key (that needs a dot BEFORE it), and `.stack` is always suspect.
const ERR_TOKEN =
  /(?:\b(?:e|e\d|ex|err|error|caught|[A-Za-z]*[Ee]rr(?:or)?)\s*\.\s*(?:message|stack)\b)|(?:as\s+Error\s*\)\s*\.\s*(?:message|stack)\b)|(?:\bString\s*\(\s*(?:e|e\d|ex|err|error|caught)\b)|(?:\.\s*stack\b)/;

// Extract the text of each `caller(...)` span with balanced parens, starting at each match of `openRe`.
function spans(src, openRe) {
  const res = [];
  let m;
  const re = new RegExp(openRe, "g");
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length - 1; // index of the '('
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    res.push(src.slice(start, i + 1));
  }
  return res;
}

const violations = [];
for (const file of files) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
  // Response-construction spans only (NOT errorResponse — the safe owner).
  const responseSpans = [
    ...spans(src, /\bjsonResponse\s*\(/),
    ...spans(src, /\bnew\s+Response\s*\(/),
  ];
  for (const span of responseSpans) {
    if (ERR_TOKEN.test(span)) {
      // Find a representative line number for the first offending token.
      const idx = src.indexOf(span);
      const line = src.slice(0, idx).split("\n").length;
      violations.push({ rel, line, snippet: span.replace(/\s+/g, " ").slice(0, 120) });
    }
  }
}

if (violations.length) {
  console.error(
    `✖ check-no-error-in-edge-response: ${violations.length} edge response(s) carry a caught error's text ` +
      `(leaks internals — CodeQL js/stack-trace-exposure, decisions.md §8):`
  );
  for (const v of violations) console.error(`  ${v.rel}:${v.line}\n      > ${v.snippet}`);
  console.error(
    `\nRoute the error through the single owner: \`return errorResponse(e, "<static message>", <status>);\`\n` +
      `(import { errorResponse } from "../_shared/http.ts"). Log the real error separately; never put it in the body.`
  );
  process.exit(1);
}

console.log(
  `✓ check-no-error-in-edge-response: OK — ${files.length} edge function file(s) scanned, ` +
    `no caught-error text in any jsonResponse/Response body.`
);

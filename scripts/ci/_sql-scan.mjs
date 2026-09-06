/**
 * Shared single-pass SQL "code view" tokenizer for the schema-reconciliation gate (ADR-0036).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every category's #1 verifier finding was the same: "replace the naive ordered strip regexes
 * with a real single-pass scanner." SQL comments (`--`, block), single-quoted string literals,
 * and dollar-quoted bodies ($$...$$, $tag$...$tag$) MUTUALLY NEST — a `--` can live inside a
 * dollar body, a `$$` can appear inside a '...' string, a `'` can appear inside a comment. Ordered
 * regex passes therefore either over-consume real DDL (a silent false negative — the exact failure
 * this gate fights) or leak DDL-shaped PROSE from Gherkin/BDD bodies as phantom objects (the fake
 * `public` table class). Only a left-to-right scanner that, at each position, consumes whichever
 * construct opens FIRST is sound.
 *
 * `codeView(sql, {keepDoBodies})` returns the SQL with every non-code span replaced by
 * EQUAL-LENGTH whitespace (newlines preserved) so that:
 *   - regexes run against `codeView(sql)` never match inside comments/strings/bodies, and
 *   - match indices/offsets still line up with the ORIGINAL text (needed by the constraints
 *     category, which recovers the real identifier from the original string by offset).
 *
 * keepDoBodies=true KEEPS the inside of a `DO [LANGUAGE x] $$ ... $$` block as code, because the
 * columns/rls/triggers/policies/indexes categories declare REAL objects inside `DO` loops
 * (the reference_* `EXECUTE format('... %I ...')` fan-outs). Those categories then rely on the
 * `%`-placeholder tripwire to force the dynamic names into a reviewed sidecar rather than silently
 * extracting nothing. CREATE FUNCTION bodies (also dollar-quoted, but never preceded by `DO`) are
 * always masked — their PL/pgSQL text is noise for schema extraction.
 *
 * Underscore-prefixed = shared harness module, not a guard: excluded from the guard scans by
 * construction (needs no wiring/test of its own; exercised through its callers + its own smoke test).
 */

/** True if the `$tag$` opening at `sql[i]` is the body of a `DO [LANGUAGE lang] ...` statement. */
function precededByDo(code, i) {
  // `code` is the partially-masked output so far; look back over whitespace for `DO`/`DO LANGUAGE x`.
  const back = code.slice(Math.max(0, i - 48), i);
  return /\bdo\s+(?:language\s+[a-z0-9_]+\s+)?$/i.test(back);
}

/**
 * Return a "code only" view of `sql`: comments, single-quoted strings, and dollar-quoted bodies
 * replaced by equal-length spaces (newlines kept). Offsets are preserved 1:1 with the input.
 * @param {string} sql
 * @param {{keepDoBodies?: boolean}} [opts]
 */
export function codeView(sql, opts = {}) {
  const keepDo = !!opts.keepDoBodies;
  const n = sql.length;
  const out = sql.split("");
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) {
      if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
    }
  };
  let i = 0;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    // line comment  -- ... EOL
    if (c === "-" && c2 === "-") {
      let j = i + 2;
      while (j < n && sql[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    // block comment  /* ... */  (Postgres block comments do NOT nest in our corpus; flat scan)
    if (c === "/" && c2 === "*") {
      let j = i + 2;
      while (j < n && !(sql[j] === "*" && sql[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }
    // single-quoted string  '...'  with '' and \' escapes
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      j = Math.min(j, n);
      blank(i, j);
      i = j;
      continue;
    }
    // dollar-quoted body  $$...$$ or $tag$...$tag$
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*|)\$/.exec(sql.slice(i, i + 130));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length; // unterminated → to EOF (caller tripwires)
        if (keepDo && precededByDo(out.join(""), i)) {
          // Keep the DO-block body as code, but still blank the two `$tag$` delimiters so the
          // `$` chars don't confuse downstream token scans.
          blank(i, i + tag.length);
          if (close !== -1) blank(close, close + tag.length);
          i = end;
          continue;
        }
        blank(i, end);
        i = end;
        continue;
      }
    }
    i++;
  }
  return out.join("");
}

/**
 * Detect an UNTERMINATED dollar-quote (a `$tag$` with no closing `$tag$`). A guard that scans a
 * file with an unterminated body has masked everything to EOF and may silently drop real DDL —
 * callers must FAIL CLOSED on this rather than trust the (truncated) extraction.
 * @returns {string|null} the offending open tag, or null if balanced.
 */
export function unterminatedDollarTag(sql) {
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (c === "-" && c2 === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*|)\$/.exec(sql.slice(i, i + 130));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        if (close === -1) return tag;
        i = close + tag.length;
        continue;
      }
    }
    i++;
  }
  return null;
}

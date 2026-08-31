#!/usr/bin/env node
/**
 * SUPPRESS-FORWARD-HAS-REPORT-001 (ADR-0033) — `suppressForward` can never be a silent drop.
 *
 * WHY THIS EXISTS
 * ---------------
 * `logger.error(..., { suppressForward: true })` tells the logger_error_reporting bridge
 * NOT to forward that error to the reporter (ADR-0021). That is correct ONLY when the same
 * catch reports the error some other way (report / reportError / handleServiceError). If a
 * developer marks a log `suppressForward: true` WITHOUT a paired report, then once the flag
 * ramps that error is dropped with ZERO audit signal — the exact silent-drop bug ADR-0021,
 * ADR-0031 and the no-dropped-supabase-error budget exist to prevent. This guard makes that
 * combination impossible: every `suppressForward: true` callsite must have a report call in
 * its enclosing function.
 *
 * WHAT IT ASSERTS (AST, not string-match)
 * ---------------------------------------
 * For each `suppressForward: true` object property, walk up to the enclosing function and
 * require a call to one of report / reportError / reportValidationRejection /
 * handleServiceError somewhere in that function. Scope = src (services/hooks/lib/etc.); tests
 * excluded (their fixtures intentionally contain the pattern).
 *
 * Uses the shared scan harness (_guard.mjs) so fail-closed / zero-scan / evidence are
 * structural; the per-file rule does the AST check. Pinned by
 * src/test/smoke/check-suppressforward-has-report.smoke.test.ts.
 */
import ts from "typescript";
import { runScanGuard } from "./_guard.mjs";

const REPORTERS = new Set([
  "report",
  "reportError",
  "reportValidationRejection",
  "handleServiceError",
]);

/** Nearest enclosing function-like ancestor of `node` (or the SourceFile if none). */
function enclosingFn(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isConstructorDeclaration(cur) ||
      ts.isGetAccessorDeclaration(cur) ||
      ts.isSetAccessorDeclaration(cur) ||
      ts.isSourceFile(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return node.getSourceFile();
}

/** True if `scope` contains a call to a known reporter function. */
function hasReportCall(scope) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (name && REPORTERS.has(name)) {
        found = true;
        return;
      }
    }
    n.forEachChild(visit); // callback returns undefined → visits every child
  };
  visit(scope);
  return found;
}

/** Collect every `suppressForward: true` property assignment. */
function findSuppressForwardTrue(node, out = []) {
  if (
    ts.isPropertyAssignment(node) &&
    ((ts.isIdentifier(node.name) && node.name.text === "suppressForward") ||
      (ts.isStringLiteral(node.name) && node.name.text === "suppressForward")) &&
    node.initializer.kind === ts.SyntaxKind.TrueKeyword
  ) {
    out.push(node);
  }
  node.forEachChild((c) => {
    findSuppressForwardTrue(c, out);
  });
  return out;
}

runScanGuard({
  name: "check-suppressforward-has-report",
  roots: ["src"],
  include: /\.(ts|tsx)$/,
  // Tests (their fixtures set suppressForward without a real report) and the logger itself
  // (which DEFINES the flag, not a caller) are not callers subject to the rule. Exclude the
  // logger by EXACT repo-relative path — an unanchored basename (`logger.service.ts$`) would
  // also skip a future `*-logger.service.ts`, silently hiding a real unpaired site (a false pass).
  exclude: (rel) => /\.test\.(ts|tsx)$/.test(rel) || rel === "src/services/logger.service.ts",
  rule(src, rel) {
    if (!src.includes("suppressForward")) return []; // fast path — the vast majority of files
    let sf;
    try {
      sf = ts.createSourceFile(
        rel,
        src,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
    } catch {
      return [{ text: "could not parse for suppressForward analysis" }];
    }
    const violations = [];
    for (const prop of findSuppressForwardTrue(sf)) {
      const fn = enclosingFn(prop);
      if (!hasReportCall(fn)) {
        const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
        violations.push({
          line,
          text:
            "`suppressForward: true` here has NO report/reportError/handleServiceError in its " +
            "enclosing function — once the logger_error_reporting flag ramps this error is dropped " +
            "with zero audit signal. Report it (or remove suppressForward). See ADR-0033.",
        });
      }
    }
    return violations;
  },
});

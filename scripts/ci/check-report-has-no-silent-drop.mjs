#!/usr/bin/env node
/**
 * REPORT-NO-SILENT-DROP-001 (ADR-0031) — report() must never silently drop.
 *
 * WHY THIS EXISTS
 * ---------------
 * `report()` in src/lib/observability/report.ts is the single client-side error
 * chokepoint. When the structural classifier says an error is not worth a
 * per-incident Triage row (`classify().report === false`), report() must STILL
 * leave a durable trace — an aggregate `recordClassifiedDrop(reason, source)` —
 * so a persistent failure misclassified as "transient" (every 500/timeout is
 * classified transient) surfaces as a rising count in System Health instead of
 * vanishing. If that branch is ever reduced to a bare `return`, the reporter
 * regains a black hole and the highest-value class of bug (a backend that fails
 * for everyone, every time) becomes invisible. This guard makes that regression
 * impossible to merge.
 *
 * WHAT IT ASSERTS (AST, not string-match)
 * ---------------------------------------
 * Parse report.ts with the TypeScript compiler API, find the `report` function,
 * and require that EVERY `if (!<x>.report)` branch inside it contains a call to
 * `recordClassifiedDrop(...)`. Scope is the drop branch specifically — a call
 * elsewhere in the file does not count (that is exactly the false-green a regex
 * would allow).
 *
 * FAIL CLOSED (decisions.md §6): unreadable/ unparseable file, or the `report`
 * function / its `!*.report` branch not found (structure changed) → exit 2, never
 * a vacuous pass. A found drop branch missing the recorder → exit 1.
 *
 * This guard reads ONE file (no directory walk), so it does not use the
 * _guard.mjs scan harness and is not subject to check-ci-guard-integrity's
 * hand-rolled-walk rule. Pinned by
 * src/test/smoke/check-report-has-no-silent-drop.smoke.test.ts.
 *
 * REPORT_GUARD_FILE overrides the target file for this guard's own smoke test
 * (throwaway fixtures); never set in CI/production, so the shipped behavior always
 * inspects the real report.ts.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = process.env.REPORT_GUARD_FILE
  ? resolve(process.env.REPORT_GUARD_FILE)
  : join(ROOT, "src/lib/observability/report.ts");

const RECORDER = "recordClassifiedDrop";
const rel = relative(ROOT, TARGET).replace(/\\/g, "/") || TARGET;

const die = (msg, code = 2) => {
  console.error(`✖ check-report-has-no-silent-drop: ${msg}`);
  process.exit(code);
};

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch (e) {
  die(`cannot read ${rel} — ${e.message}. Failing closed.`);
}

let sf;
try {
  sf = ts.createSourceFile(TARGET, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
} catch (e) {
  die(`cannot parse ${rel} — ${e.message}. Failing closed.`);
}

/** Find the `report` function (declaration or `const report = (…) => …`). */
function findReportFn(node, found = []) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "report") found.push(node);
  else if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "report" &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    found.push(node.initializer);
  }
  // NOTE: ts.forEachChild STOPS at the first child whose callback returns a
  // truthy value, so the callback MUST return undefined to visit EVERY child.
  node.forEachChild((c) => {
    findReportFn(c, found);
  });
  return found;
}

const reportFns = findReportFn(sf);
if (reportFns.length === 0) {
  die(
    `could not find the \`report\` function in ${rel} — the reporter chokepoint moved or was renamed. Failing closed rather than passing vacuously.`
  );
}

/** Collect `if (!<expr>.report)` statements within a node. */
function findDropBranches(node, out = []) {
  if (ts.isIfStatement(node)) {
    const c = node.expression;
    if (
      ts.isPrefixUnaryExpression(c) &&
      c.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isPropertyAccessExpression(c.operand) &&
      c.operand.name.text === "report"
    ) {
      out.push(node);
    }
  }
  // forEachChild stops on a truthy return — callback must return undefined.
  node.forEachChild((child) => {
    findDropBranches(child, out);
  });
  return out;
}

/** True if `node` contains a call `recordClassifiedDrop(...)`. */
function callsRecorder(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === RECORDER) {
      found = true;
      return;
    }
    n.forEachChild(visit);
  };
  visit(node);
  return found;
}

const dropBranches = reportFns.flatMap((fn) => findDropBranches(fn));
if (dropBranches.length === 0) {
  die(
    `found \`report\` but no \`if (!…​.report)\` classifier-drop branch in ${rel} — the drop path was restructured. Failing closed (cannot confirm the drop is tracked).`
  );
}

const uncovered = dropBranches.filter((b) => !callsRecorder(b.thenStatement));
if (uncovered.length) {
  const lines = uncovered.map((b) => sf.getLineAndCharacterOfPosition(b.getStart(sf)).line + 1);
  console.error(
    `✖ check-report-has-no-silent-drop: ${uncovered.length} classifier-drop branch(es) in ${rel} do NOT call ${RECORDER}(...) — a silent \`return\` here is a black hole (a persistent failure misclassified as transient vanishes). See ADR-0031.`
  );
  for (const ln of lines) console.error(`  - ${rel}:${ln}  (drop branch missing ${RECORDER})`);
  console.error(
    `  Fix: call ${RECORDER}(classified.reason ?? "unknown", ctx.source) at the top of the \`if (!classified.report)\` branch before it returns.`
  );
  process.exit(1);
}

console.log(
  `✓ check-report-has-no-silent-drop: OK — ${rel}: all ${dropBranches.length} classifier-drop branch(es) record via ${RECORDER} before returning (no black hole).`
);

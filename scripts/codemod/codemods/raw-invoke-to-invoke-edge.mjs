/**
 * CODEMOD: raw-invoke-to-invoke-edge
 *
 * Migrates raw `supabase.functions.invoke(...)` call sites to `invokeEdge(...)`
 * (src/lib/edge/invokeEdge.ts). This arms Phase 1's raw-invoke migration
 * (hardening-plan.md §"Phase 0 · 0c" / Category ②).
 *
 * WHY IT ONLY TRANSFORMS ONE SHAPE — precision over coverage:
 * `invokeEdge` THROWS `EdgeInvokeError` on failure; the raw client RETURNS
 * `{ data, error }`. Those are only equivalent when the caller's own code already
 * turns a truthy `error` into a throw and does nothing else with it. So we transform
 * exactly ONE canonical shape, under THREE conditions, and REPORT everything else as
 * manual — we never guess at bespoke error handling.
 *
 *   SAFE (transform) — all three must hold:
 *     const { data, error } = await supabase.functions.invoke<T>(FN, OPTS);
 *     if (error) throw error;
 *   becomes:
 *     const data = await invokeEdge<T>(FN, OPTS);
 *   (+ `import { invokeEdge } from "@/lib/edge/invokeEdge";` if absent)
 *   1. the next statement is exactly `if (error) throw error;` (nothing else);
 *   2. OPTS is an object literal with keys ⊆ { body, headers } — invokeEdge drops
 *      `method`/`region`, so a variable/spread/other-key OPTS is NOT safe;
 *   3. `error` is referenced nowhere else (else the output references an undefined binding).
 *
 *   MANUAL (report, never transform): any other shape — `{ error }`-only +
 *   handleServiceError, bare `await ...invoke(...)`, error returned not thrown,
 *   result wrapped in another call, custom branching, etc.
 *
 * Interface consumed by the harness (scripts/codemod/run-codemod.mjs):
 *     export const name = "raw-invoke-to-invoke-edge";
 *     export function apply(sourceFile) -> { changed: boolean, manual: [{line, reason}] }
 */
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";

export const name = "raw-invoke-to-invoke-edge";

const INVOKE_MODULE = "@/lib/edge/invokeEdge";
const INVOKE_FN = "invokeEdge";

// invokeEdge forwards only these to the client; the raw invoke ALSO honors `method`/`region`.
const SUPPORTED_OPTS = new Set(["body", "headers"]);

// Defense in depth: the harness excludes frozen-auth/tests, but the codemod also
// refuses to rewrite the wrapper itself or the audited-invoke plumbing (both legitimately
// call the raw client and must keep doing so).
const SELF_SKIP = [/\/lib\/edge\/invokeEdge\.ts$/, /\/integrations\/supabase\/audited-invoke\.ts$/];

/** Is this call expression a `supabase.functions.invoke(...)` (any type args)? */
function isRawInvokeCall(call) {
  const expr = call.getExpression();
  return /(^|\.)supabase\.functions\.invoke$/.test(expr.getText());
}

/** `if (error) throw error;` (bare or single-statement block, no else). */
function isCanonicalErrorThrow(stmt) {
  if (!stmt || stmt.getKind() !== SyntaxKind.IfStatement) return false;
  if (stmt.getElseStatement()) return false;
  const cond = stmt.getExpression();
  if (cond.getKind() !== SyntaxKind.Identifier || cond.getText() !== "error") return false;
  let thenStmt = stmt.getThenStatement();
  if (thenStmt.getKind() === SyntaxKind.Block) {
    const inner = thenStmt.getStatements();
    if (inner.length !== 1) return false;
    thenStmt = inner[0];
  }
  if (thenStmt.getKind() !== SyntaxKind.ThrowStatement) return false;
  const thrown = thenStmt.getExpression();
  return !!thrown && thrown.getKind() === SyntaxKind.Identifier && thrown.getText() === "error";
}

/**
 * invokeEdge forwards only { body, headers }; the raw client also honors `method`/`region`.
 * A site is safe only if its options are an OBJECT LITERAL whose keys ⊆ SUPPORTED_OPTS —
 * otherwise the transform would silently drop options. A variable/spread options object
 * (or extra args) can't be verified statically → not safe.
 */
function optionsSupported(call) {
  const args = call.getArguments();
  if (args.length < 2) return true; // no options object
  if (args.length > 2) return false; // unexpected extra args
  const opts = args[1];
  if (opts.getKind() !== SyntaxKind.ObjectLiteralExpression) return false; // variable / spread / call
  for (const p of opts.getProperties()) {
    const k = p.getKind();
    if (k !== SyntaxKind.PropertyAssignment && k !== SyntaxKind.ShorthandPropertyAssignment)
      return false;
    if (!SUPPORTED_OPTS.has(p.getName())) return false; // method, region, or any unknown key
  }
  return true;
}

/**
 * The transform collapses `const { data, error }` to `const data` and drops `if (error) throw error`.
 * That is only safe if `error` is referenced NOWHERE else — otherwise the output references an
 * undefined binding. Returns true if `error` is used beyond the canonical `if`.
 */
function errorUsedBeyondThrow(varStmt, ifStmt) {
  // PURELY SYNTACTIC (no language service) so it behaves identically in the harness project
  // (built with skipFileDependencyResolution) and in tests — a findReferences-based check
  // silently resolved differently between the two, which is the exact test-doesn't-reflect-
  // harness discrepancy we must not have. Scan the binding's visible scope for any `error`
  // identifier outside the declaration and outside the canonical `if`. Over-approximates (a
  // shadowing `error` in a nested block also routes to MANUAL) — safe, per precision-over-coverage.
  // Only scope-scan when the declaration sits DIRECTLY in a Block or the SourceFile. Any other
  // parent (e.g. a braceless switch `case`) means a block-scoped `error` could still be visible in a
  // sibling scope this scan wouldn't cover — so we can't prove safety → route to MANUAL. Zero false
  // negatives (never emit code referencing an undefined `error`) at the cost of a few rare MANUALs.
  const scope =
    varStmt.getParentIfKind(SyntaxKind.Block) ?? varStmt.getParentIfKind(SyntaxKind.SourceFile);
  if (!scope) return true;
  const declStart = varStmt.getStart();
  const declEnd = varStmt.getEnd();
  const ifStart = ifStmt.getStart();
  const ifEnd = ifStmt.getEnd();
  for (const id of scope.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== "error") continue;
    if (id.getStart() >= declStart && id.getEnd() <= declEnd) continue; // the declaration binding
    if (id.getStart() >= ifStart && id.getEnd() <= ifEnd) continue; // inside the canonical if
    const paccess = id.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    if (paccess && paccess.getNameNode() === id) continue; // a `.error` member, not the binding
    return true; // some other reference to the `error` binding in scope
  }
  return false;
}

/**
 * Classify one raw-invoke call. Returns either
 *   { safe: true, call, varStmt, ifStmt }  — a transformable canonical site, or
 *   { safe: false, line, reason }          — a manual site with a one-word reason.
 */
function classify(call) {
  const line = call.getStartLineNumber();
  const manual = (reason) => ({ safe: false, line, reason });

  const awaitExpr = call.getParentIfKind(SyntaxKind.AwaitExpression);
  if (!awaitExpr) return manual("not-awaited"); // void/fire-and-forget or wrapped-in-callback

  const varDecl = awaitExpr.getParentIfKind(SyntaxKind.VariableDeclaration);
  if (!varDecl) return manual("no-destructure"); // bare `await ...`, `x = await ...`, `return await ...`

  const nameNode = varDecl.getNameNode();
  if (nameNode.getKind() !== SyntaxKind.ObjectBindingPattern) return manual("no-destructure");

  const elements = nameNode.getElements();
  if (elements.some((e) => e.getDotDotDotToken() || e.getInitializer() || e.getPropertyNameNode()))
    return manual("complex-destructure"); // rest, defaults, or renamed bindings

  const names = elements.map((e) => e.getName());
  const hasError = names.includes("error");
  const hasData = names.includes("data");
  if (!hasError) return manual("error-ignored");
  if (!hasData || elements.length !== 2) return manual("error-only"); // `{ error }` only, etc.

  const varStmt = varDecl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (!varStmt || varStmt.getDeclarationList().getDeclarations().length !== 1)
    return manual("multi-declaration");

  const nextStmt = varStmt.getNextSibling();
  if (!isCanonicalErrorThrow(nextStmt)) return manual("error-not-thrown");

  if (!optionsSupported(call)) return manual("unsupported-options"); // method/region/spread would be dropped
  if (errorUsedBeyondThrow(varStmt, nextStmt)) return manual("error-used-later");

  return { safe: true, call, varStmt, ifStmt: nextStmt };
}

/** Rewrite a canonical site in place. Node refs must be live (re-query per transform). */
function transformSafe(site) {
  const { call, varStmt, ifStmt } = site;
  const kind = varStmt.getDeclarationKind(); // VariableDeclarationKind ("const"/"let"/"var")
  const typeArgs = call.getTypeArguments();
  const typeArgsText = typeArgs.length ? `<${typeArgs.map((t) => t.getText()).join(", ")}>` : "";
  const argsText = call
    .getArguments()
    .map((a) => a.getText())
    .join(", ");
  const declKw =
    kind === VariableDeclarationKind.Const
      ? "const"
      : kind === VariableDeclarationKind.Let
        ? "let"
        : "var";

  ifStmt.remove(); // drop `if (error) throw error;`
  varStmt.replaceWithText(`${declKw} data = await ${INVOKE_FN}${typeArgsText}(${argsText});`);
}

function hasInvokeEdgeImport(sourceFile) {
  return sourceFile
    .getImportDeclarations()
    .some(
      (d) =>
        d.getModuleSpecifierValue() === INVOKE_MODULE &&
        d.getNamedImports().some((n) => n.getName() === INVOKE_FN)
    );
}

function ensureImport(sourceFile) {
  if (hasInvokeEdgeImport(sourceFile)) return;
  sourceFile.addImportDeclaration({ moduleSpecifier: INVOKE_MODULE, namedImports: [INVOKE_FN] });
}

/** Collect every raw-invoke site in the file, classified. */
function collectSites(sourceFile) {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(isRawInvokeCall)
    .map(classify);
}

export function apply(sourceFile) {
  const filePath = sourceFile.getFilePath();
  if (SELF_SKIP.some((re) => re.test(filePath))) return { changed: false, manual: [] };

  // Pass 1 — classify on the pristine tree so reported manual line numbers are stable.
  const sites = collectSites(sourceFile);
  const manual = sites.filter((s) => !s.safe).map((s) => ({ line: s.line, reason: s.reason }));
  const anySafe = sites.some((s) => s.safe);
  if (!anySafe) return { changed: false, manual };

  // Pass 2 — transform safe sites one at a time, re-querying because each edit forgets
  // previously-wrapped nodes. A transformed site no longer matches isRawInvokeCall, so
  // this terminates.
  let changed = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const site = collectSites(sourceFile).find((s) => s.safe);
    if (!site) break;
    transformSafe(site);
    changed = true;
  }
  if (changed) ensureImport(sourceFile);

  return { changed, manual };
}

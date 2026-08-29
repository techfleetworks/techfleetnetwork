/**
 * ESLint rule: no-raw-functions-invoke
 *
 * Forbids `supabase.functions.invoke(...)` outside the unified `invokeEdge`
 * wrapper. The wrapper provides:
 *   - AbortController timeout (default 8s)
 *   - Single transparent retry on FunctionsFetchError
 *   - Typed `EdgeInvokeError` throws
 *   - Structural-classifier-gated reporting
 *
 * This is the STRUCTURAL guarantee behind ADR-0028 (edge-error shape has one owner):
 * once no non-owner code can call the raw client, no consumer ever receives a raw
 * supabase error, so nothing can couple to its shape — regardless of coding style.
 * The rule is `error`; pre-existing sites are grandfathered by a SHRINK-ONLY per-file
 * budget (raw-invoke-grandfather.json). A file may keep up to its budgeted number of
 * raw invokes; any invoke ABOVE the budget (and any invoke in an unbudgeted file) is
 * an error. Migrating a site to invokeEdge lowers the file's count below budget — you
 * then lower the budget to match (it only ratchets down). Adding a new raw invoke
 * pushes a file over budget → error, so new couplings are impossible without visibly
 * raising a number in the budget file. Phase 1 burns the budget to zero.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ALLOWED_FILES = [
  "src/lib/edge/invokeEdge.ts", // the wrapper itself
  "src/integrations/supabase/audited-invoke.ts", // the audited wrapper
  "src/lib/support/freescoutInvoke.ts", // the freescout invoke wrapper
];

// Shrink-only per-file grandfather budget: repo-relative path -> raw invokes allowed.
let BUDGET = {};
try {
  BUDGET = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "raw-invoke-grandfather.json"),
      "utf8"
    )
  );
} catch {
  BUDGET = {}; // absent budget → every raw invoke is an error (fail toward stricter)
}

function repoRel(filename) {
  const f = filename.replace(/\\/g, "/");
  const i = f.lastIndexOf("/src/");
  return i >= 0 ? f.slice(i + 1) : f;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Use invokeEdge() instead of supabase.functions.invoke." },
    schema: [],
    messages: {
      forbidden:
        "Use invokeEdge() from '@/lib/edge/invokeEdge' instead of supabase.functions.invoke(). " +
        "This site is over the shrink-only grandfather budget in raw-invoke-grandfather.json (ADR-0028).",
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, "/");
    if (ALLOWED_FILES.some((f) => filename.endsWith(f))) return {};
    const rel = repoRel(filename);
    // Client code only. `invokeEdge` is a browser wrapper (@/lib/edge/invokeEdge); Deno edge
    // functions (supabase/functions/**), Node scripts, and e2e legitimately call the raw client and
    // cannot import it — the rule (and the src-keyed budget) govern src/** exclusively.
    if (!rel.startsWith("src/")) return {};
    const budget = Number.isInteger(BUDGET[rel]) ? BUDGET[rel] : 0;
    const nodes = [];
    const patternKeys = (id) =>
      id?.type === "ObjectPattern"
        ? id.properties.filter((p) => p.type === "Property").map((p) => p.key?.name)
        : [];
    return {
      MemberExpression(node) {
        if (
          node.property?.name === "invoke" &&
          node.object?.type === "MemberExpression" &&
          node.object.property?.name === "functions"
        ) {
          nodes.push(node);
        }
      },
      // Close the destructure bypasses (always an error — no grandfathered uses exist):
      //   const { invoke } = supabase.functions;   const { functions } = supabase;
      VariableDeclarator(node) {
        const init = node.init;
        if (!init) return;
        const keys = patternKeys(node.id);
        if (
          init.type === "MemberExpression" &&
          init.property?.name === "functions" &&
          keys.includes("invoke")
        ) {
          context.report({ node, messageId: "forbidden" });
        }
        if (init.type === "Identifier" && init.name === "supabase" && keys.includes("functions")) {
          context.report({ node, messageId: "forbidden" });
        }
      },
      "Program:exit"() {
        // Grandfather the first `budget` occurrences; everything beyond it is an error.
        for (let i = budget; i < nodes.length; i++) {
          context.report({ node: nodes[i], messageId: "forbidden" });
        }
      },
    };
  },
};

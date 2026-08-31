/**
 * ESLint rule: no-dropped-supabase-error
 *
 * The audit's #1 error-handling root cause: destructuring `data` from a supabase
 * call and dropping `error` —
 *
 *   const { data } = await supabase.from("x").select();   // ❌ error dropped
 *
 * A failed query (RLS drift, schema change, transient PGRST002, a 500) then falls
 * through as `data === null/undefined` with NO failure signal — the blank-data /
 * infinite-skeleton class across the app. The fix is always to take `error` too and
 * do something with it:
 *
 *   const { data, error } = await supabase.from("x").select();
 *   if (error) throw error;            // ✅ recover / retry / report
 *
 * This is the structural completion of decisions.md §4 for the read path, mirroring
 * ADR-0030's no-raw-invoke ratchet: the rule is `error`, pre-existing sites are
 * grandfathered by a SHRINK-ONLY per-file budget (dropped-supabase-error-grandfather.json),
 * and check-dropped-supabase-error-budget-shrinks.mjs forbids the budget from growing.
 * New dropped errors are impossible without visibly raising a number; the existing ones
 * burn down and never grow. ADR-0032.
 *
 * Scope: the data layer that owns error handling — src/services, src/hooks, and edge
 * functions (supabase/functions). NOT tests, and NOT UI (src/components / src/pages),
 * whose reads move into hooks/services in Phase 3 (and then flow through React Query's
 * global onError anyway).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Terminal/`data,error`-returning supabase methods. A call chain must contain one of
// these (so `supabase.channel(...)` realtime and non-supabase `.query()` clients are
// not flagged) AND be rooted at a supabase client identifier.
const SUPABASE_METHODS = new Set([
  "from",
  "rpc",
  "functions",
  "invoke",
  "storage",
  "auth",
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "single",
  "maybeSingle",
  "getSession",
  "getUser",
  "getClaims",
  "refreshSession",
]);
// Root identifier of the call chain: the imported `supabase` client, or an edge
// `adminClient`/`userClient`/`supabaseClient`/… (createClient result).
const CLIENT_ROOT = /^(supabase|.*[Cc]lient)$/;

const SCOPED_ROOTS = ["src/services/", "src/hooks/", "supabase/functions/"];

let BUDGET = {};
try {
  BUDGET = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "dropped-supabase-error-grandfather.json"),
      "utf8"
    )
  );
} catch {
  BUDGET = {}; // absent budget → every dropped error is flagged (fail toward stricter)
}

function repoRel(filename) {
  const f = filename.replace(/\\/g, "/");
  for (const marker of ["/src/", "/supabase/"]) {
    const i = f.lastIndexOf(marker);
    if (i >= 0) return f.slice(i + 1);
  }
  return f;
}

/** The Identifier at the root of a Member/Call chain (e.g. `supabase` in supabase.from().select()). */
function rootId(node) {
  let cur = node;
  while (cur) {
    if (cur.type === "ChainExpression") {
      cur = cur.expression;
      continue;
    } // supabase?.from()
    if (cur.type === "CallExpression") {
      cur = cur.callee;
      continue;
    }
    if (cur.type === "MemberExpression") {
      cur = cur.object;
      continue;
    }
    break;
  }
  return cur && cur.type === "Identifier" ? cur.name : null;
}

/** True if any property in the chain is a supabase data method. */
function chainHasSupabaseMethod(node) {
  let cur = node;
  while (cur) {
    if (cur.type === "ChainExpression") {
      cur = cur.expression;
      continue;
    }
    if (cur.type === "CallExpression") {
      cur = cur.callee;
      continue;
    }
    if (cur.type === "MemberExpression") {
      if (cur.property?.type === "Identifier" && SUPABASE_METHODS.has(cur.property.name))
        return true;
      cur = cur.object;
      continue;
    }
    break;
  }
  return false;
}

function isSupabaseCall(call) {
  if (call?.type === "ChainExpression") call = call.expression; // unwrap `await supabase?.from()…`
  if (!call || call.type !== "CallExpression") return false;
  const root = rootId(call);
  if (!root || !CLIENT_ROOT.test(root)) return false;
  return chainHasSupabaseMethod(call);
}

/** ObjectPattern that takes `data` but not `error` (and has no `...rest` that could carry it). */
function patternDropsError(id) {
  if (!id || id.type !== "ObjectPattern") return false;
  let hasData = false,
    hasError = false,
    hasRest = false;
  for (const p of id.properties) {
    if (p.type === "RestElement" || p.type === "ExperimentalRestProperty") {
      hasRest = true;
      continue;
    }
    if (p.type === "Property" && p.key?.type === "Identifier") {
      if (p.key.name === "data") hasData = true;
      if (p.key.name === "error") hasError = true;
    }
  }
  return hasData && !hasError && !hasRest;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Destructuring `data` from a supabase call without `error` drops the failure silently.",
    },
    schema: [],
    messages: {
      dropped:
        "This supabase call destructures `data` but not `error` — a failed query (RLS drift, " +
        "schema change, transient PGRST, a 500) is silently dropped (blank data / infinite " +
        "skeleton). Take `{ data, error }` and handle `error` (throw / report / branch). This " +
        "site is over the shrink-only grandfather budget in dropped-supabase-error-grandfather.json (ADR-0032).",
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, "/");
    const rel = repoRel(filename);
    if (!SCOPED_ROOTS.some((r) => rel.startsWith(r))) return {};
    // Never scan tests — their fixtures intentionally contain the pattern.
    if (
      /\.test\.[cm]?[jt]sx?$/.test(rel) ||
      rel.includes("/__tests__/") ||
      rel.startsWith("src/test/")
    ) {
      return {};
    }
    const budget = Number.isInteger(BUDGET[rel]) ? BUDGET[rel] : 0;
    const nodes = [];
    return {
      VariableDeclarator(node) {
        const init = node.init;
        if (!init || init.type !== "AwaitExpression") return;
        if (!isSupabaseCall(init.argument)) return;
        if (!patternDropsError(node.id)) return;
        nodes.push(node);
      },
      "Program:exit"() {
        // Grandfather the first `budget` occurrences; everything beyond is an error.
        for (let i = budget; i < nodes.length; i++) {
          context.report({ node: nodes[i], messageId: "dropped" });
        }
      },
    };
  },
};

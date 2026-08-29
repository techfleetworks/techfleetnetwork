#!/usr/bin/env node
/**
 * ERROR-SHAPE-OWNER-001 — the raw edge-error shape has ONE owner.
 *
 * WHY THIS EXISTS
 * ---------------
 * `invokeEdge` (src/lib/edge/invokeEdge.ts) normalizes every edge failure into a typed
 * `EdgeInvokeError` (with `.status`, `.cause`). Migrating a raw `supabase.functions.invoke`
 * call to `invokeEdge` is only globally safe if NO consumer anywhere branches on the *raw*
 * supabase error shape (`FunctionsHttpError` etc. / `.context.status`) — otherwise normalizing
 * the thrown value silently changes that consumer's behaviour (a whole-program hazard a
 * per-site codemod cannot see; see ADR-0027 "the one honest boundary", ADR-0028).
 *
 * This guard removes the hazard by CONSTRUCTION: the raw error shape may be inspected ONLY
 * inside the sanctioned normalization/classification layer (the owner). Everywhere else must
 * use `EdgeInvokeError` / `toError()` / the transient classifiers. With this green, error
 * normalization can never break a consumer — there is no consumer coupled to the old shape.
 *
 * Scan/fail-closed/zero-scan/evidence owned by the shared harness (_guard.mjs).
 */
import { runScanGuard, lineOf } from "./_guard.mjs";

// The owning layer — the ONLY files allowed to inspect the raw supabase Functions error shape,
// because normalizing it is their job. Everything else must consume the normalized form.
const OWNER = [
  /^src\/lib\/edge\/invokeEdge\.ts$/,
  /^src\/integrations\/supabase\/audited-invoke\.ts$/, // the other sanctioned invoke wrapper
  /^src\/lib\/support\/freescoutInvoke\.ts$/, // a sanctioned invoke wrapper
  /^src\/lib\/errors\//, // toError.ts, extract.ts, AppError.ts
  /^src\/lib\/transient-error\.ts$/,
  /^src\/lib\/data\/transient-retry\.ts$/,
  /^src\/services\/error-reporter\.service\.ts$/,
];

// Coupling signals to the RAW shape. Precise enough to avoid comment/false-positive noise:
//   (a) reading `.context.status` / `.context?.status` — the raw supabase error internal;
//   (b) `instanceof Functions{Http,Fetch,Relay}Error` — branching on the raw error type.
const FORBIDDEN = [
  {
    re: /\.context\??\.status\b/g,
    text: "reads a raw edge error's `.context.status` — route the call through invokeEdge and read `EdgeInvokeError.status` (ADR-0028)",
  },
  {
    re: /\[\s*["']context["']\s*\]/g,
    text: "bracket-accesses a raw edge error's `context` — use `EdgeInvokeError` / `toError()` instead (ADR-0028)",
  },
  {
    re: /instanceof\s+Functions(?:Http|Fetch|Relay)Error\b/g,
    text: "branches on a raw supabase Functions error type — use `EdgeInvokeError` / `toError()` instead (ADR-0028)",
  },
  {
    re: /\.name\s*===\s*["']Functions(?:Http|Fetch|Relay)Error["']/g,
    text: "branches on a raw supabase Functions error name — use `EdgeInvokeError` / `toError()` instead (ADR-0028)",
  },
];

runScanGuard({
  name: "check-no-raw-functions-error-shape",
  roots: ["src"],
  include: /\.(ts|tsx)$/,
  exclude: /\.test\.(ts|tsx)$/,
  rule(src, rel) {
    if (OWNER.some((re) => re.test(rel))) return []; // the owning layer may inspect the raw shape
    const out = [];
    for (const { re, text } of FORBIDDEN) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        out.push({ line: lineOf(src, m.index), text });
      }
    }
    return out;
  },
  summary: (n) => `${n} src files, owner layer exempt`,
});

#!/usr/bin/env node
/**
 * EMIT-BDD-INDEX (ADR 20261110) — derive the centralized BDD datastore from the repo's co-located
 * `.feature` files, so the feature files stay the SINGLE SOURCE OF TRUTH and the index can never
 * become a second, drifting copy. Mirrors emit-guard-matrix.mjs (ADR-0047): a generator, not a
 * guard, so it is not scanned by check-ci-guard-integrity / required by check-guard-has-test — but
 * its output is reconciled against the committed `features/bdd-index.json` by
 * scripts/ci/check-bdd-runner.mjs (fails the build on drift).
 *
 * Usage:
 *   node scripts/ci/emit-bdd-index.mjs            # human-readable summary (local debugging)
 *   node scripts/ci/emit-bdd-index.mjs --json     # the canonical datastore JSON (stdout)
 *
 * FAIL-CLOSED: exits non-zero if no feature roots exist or ZERO feature files are found (a silent
 * empty index would let the runner gate pass vacuously — the exact false-green we prevent).
 *
 * The datastore records, per feature: path, domain (derived from the path), title, scenario counts
 * (total / executable / pending), execution status, feature-level tags, and the declared audiences.
 * STATUS is derived from tags only (never hand-set): @auth → excluded-auth; feature-level @pending →
 * pending; a mix of pending/non-pending scenarios → partial; otherwise → executable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// BDD_INDEX_ROOT overrides the repo root ONLY for this tool's own smoke test, which points it at a
// throwaway fixture tree; it is never set in CI/production, so the shipped behavior always derives
// from the real repo (resolved from this file's own location, cwd-independent).
const ROOT = process.env.BDD_INDEX_ROOT
  ? resolve(process.env.BDD_INDEX_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FEATURE_ROOTS = ["supabase/functions", "src/features"];

const die = (msg) => {
  console.error(`✖ emit-bdd-index: ${msg}`);
  process.exit(2);
};

// Declared audience enumeration (the skill's audience requirement): every feature maps to >=1
// audience from this controlled vocabulary. check-bdd-runner fails closed if a feature is missing
// here, so a new feature cannot dodge audience enumeration.
export const AUDIENCE_VOCAB = [
  "anonymous",
  "authenticated",
  "admin",
  "api-consumer",
  "partner",
  "internal",
];

export const FEATURE_AUDIENCES = {
  "supabase/functions/_shared/html-to-text.feature": ["authenticated", "internal"],
  "supabase/functions/_shared/prompt-injection.feature": ["authenticated", "internal"],
  "supabase/functions/_shared/session-revocation.feature": ["authenticated", "admin"],
  "supabase/functions/_shared/figma-extract.feature": ["authenticated", "partner"],
  "supabase/functions/discord-interactions/fleety-2.1-discord.feature": ["authenticated", "partner"],
  "supabase/functions/fleety-extract/fleety-2.2-f-uploads.feature": ["authenticated"],
  "supabase/functions/handoff-download/handoff-download.feature": ["authenticated"],
  "supabase/functions/handoff-produce/handoff-produce.feature": ["authenticated"],
  "supabase/functions/handoff-submit/handoff-submit.feature": ["authenticated"],
  "supabase/functions/resend-webhook/resend-webhook.feature": ["api-consumer", "internal"],
  "supabase/functions/techfleet-chat/fleety-modes.feature": ["authenticated"],
  "src/features/auth/auth-redirect.feature": ["anonymous", "authenticated"],
};

/** Recursively collect `*.feature` files under `dir` (missing dir → []). */
function collectFeatures(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === "node_modules") continue;
      collectFeatures(full, out);
    } else if (name.endsWith(".feature")) {
      out.push(full);
    }
  }
  return out;
}

// Tag lines are `@a @b` on their own line(s); a `#` comment line resets the pending tag block, so an
// `@tag` only attaches to the next Feature:/Scenario: if it is in the contiguous tag lines above it.
function parseFeature(absPath) {
  const relPath = relative(ROOT, absPath).split(sep).join("/");
  const src = readFileSync(absPath, "utf8");
  const lines = src.split(/\r?\n/);

  let title = relPath;
  const featureTags = new Set();
  let total = 0;
  let pendingScenarios = 0;
  let pendingBlock = []; // tags accumulated on contiguous tag lines, consumed by the next keyword

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      // blank/comment line breaks a tag block (tags must be contiguous with their keyword)
      pendingBlock = [];
      continue;
    }
    if (line.startsWith("@")) {
      for (const t of line.split(/\s+/)) if (t.startsWith("@")) pendingBlock.push(t);
      continue;
    }
    if (line.startsWith("Feature:")) {
      title = line.slice("Feature:".length).trim();
      for (const t of pendingBlock) featureTags.add(t);
      pendingBlock = [];
      continue;
    }
    if (line.startsWith("Scenario:") || line.startsWith("Scenario Outline:")) {
      total += 1;
      if (pendingBlock.includes("@pending")) pendingScenarios += 1;
      pendingBlock = [];
      continue;
    }
    // any other keyword line (Given/When/Then/Examples/Background/Rule/And/But/|…) breaks the block
    pendingBlock = [];
  }

  const isAuth = featureTags.has("@auth");
  const isFeaturePending = featureTags.has("@pending");
  let status;
  let executable;
  if (isAuth) {
    status = "excluded-auth";
    executable = 0;
  } else if (isFeaturePending) {
    status = "pending";
    executable = 0;
  } else if (pendingScenarios > 0 && pendingScenarios < total) {
    status = "partial";
    executable = total - pendingScenarios;
  } else if (pendingScenarios === total && total > 0) {
    status = "pending";
    executable = 0;
  } else {
    status = "executable";
    executable = total;
  }

  const domain = relPath.startsWith("supabase/functions/")
    ? relPath.split("/")[2]
    : relPath.split("/")[2] ?? "unknown";

  return {
    path: relPath,
    domain,
    title,
    scenarios: { total, executable, pending: total - executable },
    status,
    featureTags: [...featureTags].sort(),
    audiences: FEATURE_AUDIENCES[relPath] ?? null,
  };
}

export function buildIndex() {
  const roots = FEATURE_ROOTS.map((r) => join(ROOT, r));
  const files = [];
  for (const r of roots) collectFeatures(r, files);
  if (files.length === 0)
    die(`found zero .feature files under ${FEATURE_ROOTS.join(", ")} (zero-scan). Failing closed.`);

  const features = files
    .map(parseFeature)
    .sort((a, b) => a.path.localeCompare(b.path));

  const totals = features.reduce(
    (acc, f) => {
      acc.features += 1;
      acc.scenarios += f.scenarios.total;
      acc.executable += f.scenarios.executable;
      acc.pending += f.scenarios.pending;
      acc.byStatus[f.status] = (acc.byStatus[f.status] ?? 0) + 1;
      return acc;
    },
    { features: 0, scenarios: 0, executable: 0, pending: 0, byStatus: {} }
  );

  return { audienceVocab: AUDIENCE_VOCAB, totals, features };
}

function main() {
  const index = buildIndex();
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(index, null, 2) + "\n");
    return;
  }
  const { totals, features } = index;
  console.log(
    `✓ emit-bdd-index: ${totals.features} features, ${totals.scenarios} scenarios ` +
      `(${totals.executable} executable, ${totals.pending} pending)`
  );
  for (const f of features) {
    console.log(
      `  [${f.status.padEnd(13)}] ${f.scenarios.executable}/${f.scenarios.total}  ${f.path}`
    );
  }
}

// Run only as a script (not when imported by check-bdd-runner / the smoke test).
if (import.meta.url === `file://${process.argv[1]}` || fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

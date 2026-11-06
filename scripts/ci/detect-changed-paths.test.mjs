#!/usr/bin/env node
// Discrimination test for detect-changed-paths.mjs (RC1 / RP-A, ADR 20261106).
//
// It proves the fail-open invariant is load-bearing: if someone reverts fail-open (so an
// unreliable/empty detection is treated as "nothing changed"), the first assertion below
// fails and this test reddens — which, run in gate-verify, blocks the merge. Pure `node`,
// no deps, so it runs on this host where the full toolchain cannot.

import assert from "node:assert/strict";
import { classify, computeChanged, FILTERS } from "./detect-changed-paths.mjs";

let failures = 0;
function t(name, fn) {
  try {
    fn();
    console.log("ok   - " + name);
  } catch (e) {
    failures++;
    console.error("FAIL - " + name + "\n    " + e.message);
  }
}

// The invariant: unreliable detection runs EVERY change-gated job.
t("fail-open runs every change-gated job", () => {
  const r = classify([], true);
  for (const k of Object.keys(FILTERS))
    assert.equal(r[k], true, `${k} must be true when failing open`);
});

// RC1 discrimination case: a seeded src change must make e2e run.
t("src change triggers e2e", () => {
  assert.equal(classify(["src/lib/security.ts"], false).e2e, true);
});

t("edge-function change triggers e2e + functions", () => {
  const r = classify(["supabase/functions/techfleet-chat/index.ts"], false);
  assert.equal(r.e2e, true);
  assert.equal(r.functions, true);
});

t("migration change triggers migrations + db_schema", () => {
  const r = classify(["supabase/migrations/20260101000000_x.sql"], false);
  assert.equal(r.migrations, true);
  assert.equal(r.db_schema, true);
});

// The gate must not be vacuous the other way: a genuinely unaffected (docs-only) change,
// with reliable detection, correctly skips e2e/migrations.
t("docs-only change (reliable) skips e2e and migrations", () => {
  const r = classify(["README.md", "docs/adr/20261106-x.md"], false);
  assert.equal(r.e2e, false);
  assert.equal(r.migrations, false);
});

// Proves fail-open is load-bearing: WITHOUT it, an empty/unreliable set skips everything
// (the exact RC1 failure). If a change makes empty-detection behave like this in the
// fail-open path, test 1 above breaks.
t("without fail-open an empty set skips everything (RC1 reproduction)", () => {
  const r = classify([], false);
  for (const k of Object.keys(FILTERS)) assert.equal(r[k], false);
});

// computeChanged's fail-open DECISION — the actual RC1 fix, not just classify(). These hit
// the branches that return before any git call, so they run on any host. If a future edit maps
// a missing/empty input to failOpen:false (reintroducing RC1 verbatim), each of these reddens.
t("computeChanged: PR with no base ref fails open", () => {
  assert.equal(computeChanged({ GITHUB_EVENT_NAME: "pull_request" }).failOpen, true);
});
t("computeChanged: push with empty before-sha fails open", () => {
  assert.equal(
    computeChanged({ GITHUB_EVENT_NAME: "push", GITHUB_EVENT_BEFORE: "" }).failOpen,
    true,
  );
});
t("computeChanged: push with all-zero before-sha fails open", () => {
  assert.equal(
    computeChanged({ GITHUB_EVENT_NAME: "push", GITHUB_EVENT_BEFORE: "0".repeat(40) }).failOpen,
    true,
  );
});

if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nall detect-changed-paths tests passed");

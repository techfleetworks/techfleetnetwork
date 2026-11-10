#!/usr/bin/env node
// ci-lane: critical
/**
 * PROMPT-INJECTION-001 — prompt-injection detection (OWASP LLM01) has ONE owner.
 *
 * WHY THIS EXISTS
 * ---------------
 * Detecting a jailbreak / instruction-override attempt in untrusted user input is a security
 * invariant, so it has a SINGLE owner: supabase/functions/_shared/prompt-injection.ts
 * (`hasPromptInjection` + `PROMPT_INJECTION_PATTERNS`). This detector used to exist TWICE — the
 * LIVE guard inline in techfleet-chat and a never-called `hasPromptInjectionPattern` in
 * src/lib/security.ts with DIFFERENT patterns and its own test — so the copy that was tested was
 * not the copy that ran (re-audit 2026-10-30, finding RH3 / PAT-1; decisions.md §8 "one owner").
 * A drifted or dead second copy is exactly how a weaker/stale guard silently ships. This check
 * makes a second implementation un-mergeable: everything imports the one owner.
 *
 * WHAT IT ENFORCES (fails closed — a guard must never pass without inspecting its target)
 *   1. The ONE owner module exists and still defines the detector (exit 1 if it is gone/neutered).
 *   2. No OTHER non-test file under src/ or supabase/functions/ re-declares the detector —
 *      neither by name (`function/const hasPromptInjection…`, `const PROMPT_INJECTION_PATTERNS`)
 *      nor by the injection regex signature itself (`/ignore\s+…(previous|prior|above|earlier)/`),
 *      so a renamed copy is caught too. IMPORTS/USAGES of the owner are allowed.
 *
 * It is a content scan, so it rides the shared harness (runScanGuard) rather than hand-rolling a
 * walk (check-ci-guard-integrity GATE-INTEGRITY-001 class 3). The owner-existence precheck reads a
 * single known file (no directory walk). Pinned + discriminated by
 * src/test/smoke/check-single-prompt-injection-owner.smoke.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScanGuard } from "./_guard.mjs";

const OWNER_REL = "supabase/functions/_shared/prompt-injection.ts";

// --- 1. The single owner must exist and still define the detector (fail closed) ---------------
let ownerSrc;
try {
  ownerSrc = readFileSync(join(process.cwd(), OWNER_REL), "utf8");
} catch (e) {
  console.error(
    `✖ check-single-prompt-injection-owner: the ONE owner ${OWNER_REL} is missing/unreadable ` +
      `(${e.message}). Prompt-injection detection must have exactly one owner — restore it.`
  );
  process.exit(1);
}
const ownerDefinesDetector =
  /\bexport\s+function\s+hasPromptInjection\b/.test(ownerSrc) &&
  /\bexport\s+const\s+PROMPT_INJECTION_PATTERNS\b/.test(ownerSrc);
if (!ownerDefinesDetector) {
  console.error(
    `✖ check-single-prompt-injection-owner: ${OWNER_REL} no longer exports both ` +
      `hasPromptInjection and PROMPT_INJECTION_PATTERNS — the owner was neutralized.`
  );
  process.exit(1);
}

// --- 2. No second implementation anywhere else ------------------------------------------------
// A DEFINITION by name (not an import/usage of the owner).
const NAMED_DEF = /\b(?:function|const|let|var)\s+hasPromptInjection\w*/;
const PATTERNS_DEF = /\b(?:const|let|var)\s+PROMPT_INJECTION_PATTERNS\b/;
// The injection regex signature itself — catches a copy that was renamed to evade the name checks.
// Matches the literal `/ignore\s+…(previous|prior|above|earlier)…` as it appears in source.
const REGEX_SIGNATURE = /\/ignore\\s\+[^\n/]{0,40}(?:previous|prior|above|earlier)/;

runScanGuard({
  name: "check-single-prompt-injection-owner",
  roots: ["src", "supabase/functions"],
  // allowZero: a scan that matches zero NON-owner files is fine — the owner itself is excluded in
  // the rule, and the precheck above already proved the one owner exists.
  rule(src, rel) {
    if (rel === OWNER_REL) return []; // the one owner is allowed to define the detector
    const out = [];
    if (NAMED_DEF.test(src)) {
      out.push({
        text: `re-declares a prompt-injection detector by name — import { hasPromptInjection } from the one owner (${OWNER_REL}) instead`,
      });
    } else if (PATTERNS_DEF.test(src)) {
      out.push({
        text: `defines a second PROMPT_INJECTION_PATTERNS array — the pattern set has one owner (${OWNER_REL})`,
      });
    } else if (REGEX_SIGNATURE.test(src)) {
      out.push({
        text: `contains a hand-rolled prompt-injection regex (an injection-signature copy, possibly renamed) — use hasPromptInjection from the one owner (${OWNER_REL})`,
      });
    }
    return out;
  },
});

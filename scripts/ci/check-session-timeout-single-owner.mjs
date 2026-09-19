#!/usr/bin/env node
// ci-lane: critical
// Fails CI if the session-timeout policy grows a SECOND home (ADR-0049).
//
// The 2026-09-18 "kicked out mid-work" incident had a structural root: the timeout
// lived in three places kept in sync by hand — a React guard's `timeoutMinutes = 60`,
// session.service's `IDLE_SESSION_AGE_MS`/`MAX_SESSION_AGE_MS`, and a dead
// auth-session.service declaring 30min/4h. Two clocks disagree eventually. The fix is
// ONE owner (src/lib/session-timeout-policy.ts); this guard keeps it that way:
//
//   Rule A — a legacy "second clock" constant (IDLE_SESSION_AGE_MS / MAX_SESSION_AGE_MS
//            / IDLE_TIMEOUT_MS) must not be DECLARED anywhere in src again.
//   Rule B — the owner's constants (SESSION_IDLE_TIMEOUT_MS / SESSION_ABSOLUTE_TIMEOUT_MS
//            / SESSION_IDLE_WARNING_MS) may be DECLARED only in the owner module; every
//            other file must IMPORT them, never copy them.
//
// Scan/fail-closed/zero-scan/evidence are owned by the shared harness (_guard.mjs), so
// this guard cannot produce a false green (decisions.md §6).
import { runScanGuard } from "./_guard.mjs";

const OWNER = "src/lib/session-timeout-policy.ts";

const FORBIDDEN_ANYWHERE = ["IDLE_SESSION_AGE_MS", "MAX_SESSION_AGE_MS", "IDLE_TIMEOUT_MS"];
const OWNER_ONLY = [
  "SESSION_IDLE_TIMEOUT_MS",
  "SESSION_ABSOLUTE_TIMEOUT_MS",
  "SESSION_IDLE_WARNING_MS",
];

// A DECLARATION (const/let/var NAME =), never an import — importing the owner's
// constant is exactly what we want everyone else to do.
const declRe = (name) => new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`);

runScanGuard({
  name: "check-session-timeout-single-owner",
  roots: ["src"],
  rule(src, relPath) {
    const out = [];
    const lines = src.split("\n");
    const flag = (names, message) => {
      for (const name of names) {
        const re = declRe(name);
        lines.forEach((line, i) => {
          if (re.test(line)) out.push({ line: i + 1, text: `${message} — declares \`${name}\`` });
        });
      }
    };

    flag(
      FORBIDDEN_ANYWHERE,
      "Re-introduces a legacy session-timeout constant (the two-clock bug). Import from src/lib/session-timeout-policy.ts; never declare a second timeout clock (ADR-0049)"
    );
    if (relPath !== OWNER) {
      flag(
        OWNER_ONLY,
        "Redeclares a session-timeout constant only src/lib/session-timeout-policy.ts may own. Import it — do not copy it (ADR-0049)"
      );
    }
    return out;
  },
});

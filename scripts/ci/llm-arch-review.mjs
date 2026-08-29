#!/usr/bin/env node
/**
 * llm-arch-review — the adversarial architecture review, as a CI Action.
 *
 * WHY THIS EXISTS
 * ---------------
 * `judge-arch` (the skeptical-architect review against the four questions) has always been an
 * agent-run CONVENTION: it runs because an agent follows AGENTS.md, not because CI forces it. A
 * human-opened PR gets every mechanical gate but NOT the adversarial review. This is the last
 * convention-only gap named in AGENTS.md and ADR-0023. This job closes it: it runs the same rubric
 * on every PR's diff via an LLM and posts the findings as a single, upserted PR comment.
 *
 * ROLLOUT (ADR-0025, mirrors ADR-0019/0020 "observe, then block")
 * ---------------------------------------------------------------
 * INFORMATIONAL first: it always exits 0 and only comments. Once the team trusts its signal it can
 * be promoted to blocking (fail when it reports a violation) by setting ENFORCE=1 — but reachability
 * / config failures NEVER block (a review we couldn't run is not a violation).
 *
 * COST / SAFETY
 * -------------
 * - The static rules (AGENTS.md + decisions.md + the rubric) are sent as a cache_control block, so
 *   repeated runs pay ~10% of the input cost for that prefix.
 * - The diff is capped (LLM_REVIEW_MAX_DIFF_CHARS) so a huge PR cannot spike the bill; truncation is
 *   disclosed to the model and in the comment.
 * - No key configured (e.g. a fork PR, where secrets are withheld) → self-healing SKIP (exit 0).
 *
 * SEAMS (test-only; never set in prod/CI)
 * ---------------------------------------
 * - LLM_REVIEW_FIXTURE   : read the model's response text from this file instead of calling the API.
 * - LLM_REVIEW_DIFF_FILE : read the diff from this file instead of `git diff`.
 * - --dry-run            : print the assembled comment to stdout instead of posting it.
 *
 * Env in CI: ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), PR number via
 * GITHUB_REF or LLM_REVIEW_PR. MODEL and BASE_REF are configurable.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MARKER = "<!-- llm-arch-review -->";
const MODEL = process.env.LLM_REVIEW_MODEL || "claude-sonnet-5";
const MAX_DIFF = Number(process.env.LLM_REVIEW_MAX_DIFF_CHARS || "60000");
const MAX_TOKENS = Number(process.env.LLM_REVIEW_MAX_TOKENS || "1500");
const ENFORCE = /^(1|true|yes)$/i.test(process.env.ENFORCE ?? "");
const DRY_RUN = process.argv.includes("--dry-run");

// The four questions below MIRROR the authoritative rules in decisions.md / AGENTS.md, which are
// ALSO sent to the model as the cached rules block — so the model always sees the source of truth.
// This inline copy exists to shape the OUTPUT FORMAT; if it ever drifts, the canonical files win.
const RUBRIC = `You are a skeptical senior architect reviewing a change you did NOT write, in FRESH context.
Ask for PROBLEMS, not approval — do NOT open with what is good, and never manufacture findings to look
thorough. If the change is clean, say so in one line and stop; an empty report is a good result.
Report findings, NOT fixes (name the smallest fix, but do not rewrite the code). Name the AREA a problem
lives in (module/layer/file), not exhaustive line lists.

Judge the diff against these four questions:
1. Boundary placement — business rules (calculations, checks, workflows) that leaked into route
   handlers / controllers / UI components; logic fused with display; a workflow trapped in one caller.
2. Data ownership — a value written in two places; a stored total next to the rows it should be computed
   from; a mirror of another system's state with no sync path; writing into another module's tables.
3. Dependency direction — domain/service/edge code importing or referencing web/UI concerns (request,
   response, session, cookie, window, document); a data model that knows about requests.
4. Error handling — a catch that does none of recover/retry/report; a swallowed error returning
   null/false; an unhandled rejection; a new error type nothing upstream handles.
Also flag over-engineering (an interface/factory/manager for a single use; unasked-for changes) and
under-engineering (logic in the wrong layer; duplicated blocks; patch-on-patch).

Apply the "does it matter now?" test: before reporting a finding, answer "what breaks later if ignored?"
If the honest answer is "nothing, it's a speculative nicety," DROP it. Precision over volume.

OUTPUT FORMAT — start with EXACTLY one line:
  ARCH-REVIEW: PASS
or
  ARCH-REVIEW: <N> finding(s)
Then, only if there are findings, one block each, most-severe first:
  ### <the rule that was broken>
  **Where:** <area>
  **What breaks if ignored:** <concrete future failure>
  **Smallest fix:** <least-invasive change>
Keep it tight and skimmable. This is posted verbatim as a PR comment.`;

/** Assemble the model request. `rules` is the cacheable static prefix. */
export function buildRequest({ rules, diff, truncated }) {
  const diffNote = truncated
    ? `\n\n(NOTE: the diff was truncated to ${MAX_DIFF} characters to bound cost; review what is shown.)`
    : "";
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: RUBRIC },
      { type: "text", text: rules, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Here is the change set to review (unified diff vs the merge base):\n\n\`\`\`diff\n${diff}\n\`\`\`${diffNote}`,
      },
    ],
  };
}

/** Wrap the model's text as the comment body (marker first so we can upsert). */
export function buildComment(reviewText) {
  const body = (reviewText || "").trim() || "ARCH-REVIEW: PASS";
  return `${MARKER}\n### 🏛️ Architecture review (advisory)\n\n${body}\n\n<sub>Automated adversarial review against the four questions in \`AGENTS.md\` / \`decisions.md\`. Advisory — a human still decides. See ADR-0025.</sub>`;
}

/** A review "fails" (for ENFORCE mode) only when it reported findings, never on a skip/error. */
export function hasFindings(reviewText) {
  return /^\s*ARCH-REVIEW:\s*\d+\s+finding/im.test(reviewText || "");
}

function skip(reason) {
  console.log(`::notice::[llm-arch-review] SKIPPED — ${reason}`);
  process.exit(0);
}

function loadRules() {
  const parts = [];
  for (const f of ["AGENTS.md", "decisions.md"]) {
    if (existsSync(f)) parts.push(`# ${f}\n\n${readFileSync(f, "utf8")}`);
  }
  if (!parts.length) skip("no AGENTS.md or decisions.md found to review against");
  return parts.join("\n\n---\n\n");
}

function loadDiff() {
  if (process.env.LLM_REVIEW_DIFF_FILE) {
    return readFileSync(process.env.LLM_REVIEW_DIFF_FILE, "utf8");
  }
  const base = process.env.BASE_REF || "origin/main";
  try {
    return execFileSync("git", ["diff", "--merge-base", base, "--", ".", ":(exclude)*.lock"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    // Fall back to a plain diff if the merge-base form is unavailable (shallow checkout, etc.).
    return execFileSync("git", ["diff", `${base}...HEAD`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  }
}

async function callModel(req) {
  if (process.env.LLM_REVIEW_FIXTURE) {
    return readFileSync(process.env.LLM_REVIEW_FIXTURE, "utf8");
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) skip("ANTHROPIC_API_KEY not configured (e.g. a fork PR, where secrets are withheld)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      // prompt caching (the cache_control block below) is generally available — no beta header needed.
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    // A review we couldn't run is NOT a violation — warn and exit 0, even under ENFORCE.
    console.log(
      `::warning::[llm-arch-review] model call failed (HTTP ${res.status}) — ${body}. Not blocking.`
    );
    process.exit(0);
  }
  const json = await res.json();
  return (json.content || [])
    .map((b) => b.text || "")
    .join("")
    .trim();
}

async function postComment(body) {
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  const token = process.env.GITHUB_TOKEN?.trim();
  const pr =
    process.env.LLM_REVIEW_PR || (process.env.GITHUB_REF || "").match(/refs\/pull\/(\d+)\//)?.[1];
  if (!repo || !token || !pr)
    skip("missing GITHUB_REPOSITORY / GITHUB_TOKEN / PR number — cannot post");

  const api = `https://api.github.com/repos/${repo}/issues/${pr}/comments`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "llm-arch-review",
  };
  // Upsert: find our previous marker comment and edit it, else create one — no comment spam.
  // Paginate so the marker is still found on a PR that already has >100 comments (issue comments
  // come back oldest-first); bounded so a pathological thread can't loop unboundedly.
  let existing = null;
  for (let page = 1; page <= 10 && !existing; page++) {
    const list = await fetch(`${api}?per_page=100&page=${page}`, { headers });
    if (!list.ok) break;
    const batch = await list.json();
    existing = batch.find((c) => (c.body || "").includes(MARKER)) || null;
    if (batch.length < 100) break; // last page reached
  }
  const target = existing
    ? `https://api.github.com/repos/${repo}/issues/comments/${existing.id}`
    : api;
  const r = await fetch(target, {
    method: existing ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!r.ok) {
    const b = (await r.text().catch(() => "")).slice(0, 200);
    console.log(`::warning::[llm-arch-review] could not post comment (HTTP ${r.status}) — ${b}`);
  }
}

// --- main --------------------------------------------------------------------
async function main() {
  const rules = loadRules();
  let diff = loadDiff();
  if (!diff.trim()) skip("empty diff — nothing to review");
  const truncated = diff.length > MAX_DIFF;
  if (truncated) diff = diff.slice(0, MAX_DIFF);

  const review = await callModel(buildRequest({ rules, diff, truncated }));
  const comment = buildComment(review);

  if (DRY_RUN) {
    console.log(comment);
  } else {
    await postComment(comment);
  }

  if (ENFORCE && hasFindings(review)) {
    console.error(
      "::error::[llm-arch-review] architecture findings reported (ENFORCE mode). See the PR comment."
    );
    process.exit(1);
  }
  process.exit(0);
}

// Run only when executed directly, so tests can import the pure helpers above.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Advisory contract (ADR-0025): a review we couldn't RUN is not a violation. Any thrown
  // reachability/infra error (a `fetch` rejection, a `git` failure) must warn and exit 0 — never
  // block, even under ENFORCE. Intentional outcomes use process.exit() and bypass this catch:
  // the ENFORCE "findings" path exits 1 itself, and skip()/HTTP-error paths exit 0 themselves.
  main().catch((e) => {
    console.log(
      `::warning::[llm-arch-review] could not complete the review — ${e?.message ?? e}. Not blocking.`
    );
    process.exit(0);
  });
}

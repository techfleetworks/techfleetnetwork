// Prompt-injection detection — the ONE owner (ADR 20261106-prompt-injection-single-owner).
//
// OWASP LLM01 (Prompt Injection). Detecting a jailbreak / instruction-override attempt in
// untrusted user input is a security invariant, so it has a SINGLE owner — never a per-call
// hand-rolled copy. Two copies drift: this detector previously existed twice (the LIVE guard
// in techfleet-chat and a never-called `hasPromptInjectionPattern` in src/lib/security.ts with
// DIFFERENT patterns and a different test), so the one that was tested was not the one that ran
// (re-audit 2026-10-30, finding RH3 / PAT-1). Everything that needs this detection imports from
// here; `scripts/ci/check-single-prompt-injection-owner.mjs` makes a second copy un-mergeable.
//
// Pure, runtime-agnostic TypeScript (regex only, no Deno/DOM globals) so the ONE owner is usable
// from both the Deno edge functions (techfleet-chat today) and the Vite/React src bundle if a
// client-side pre-flight is ever needed — without a second implementation.

/**
 * Canonical prompt-injection / jailbreak signatures. These are the patterns that ACTUALLY guard
 * the live Fleety chat endpoint (techfleet-chat). Case-insensitive; a single match is enough.
 *
 * Exported so callers and tests reference the one source of truth (and so the list is reviewable
 * as data, not buried in a closure).
 */
export const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|guidelines?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the|DAN|jailbroken|unrestricted)/i,
  /act\s+as\s+(if\s+you\s+are\s+|a\s+)?(DAN|unrestricted|unfiltered|evil)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(DAN|unrestricted|different\s+AI)/i,
  /system\s*prompt/i,
  /\[SYSTEM\]/i,
  /\<\|im_start\|/i,
  /\<\|endoftext\|/i,
  /reveal\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?)/i,
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /override\s+(safety|content|security)\s+(filter|policy|rules?)/i,
  /bypass\s+(the\s+)?(restrictions?|filters?|rules?|safety)/i,
  /do\s+anything\s+now/i,
  /jailbreak/i,
];

/**
 * True when `content` matches any known prompt-injection / jailbreak signature.
 *
 * @param content Untrusted user text (a non-string is treated as "no match").
 */
export function hasPromptInjection(content: string): boolean {
  if (typeof content !== "string" || content.length === 0) return false;
  return PROMPT_INJECTION_PATTERNS.some((p) => p.test(content));
}

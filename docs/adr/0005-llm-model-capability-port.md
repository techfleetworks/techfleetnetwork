# ADR-0005: LLM provider/model behind a capability port

- **Status:** Accepted (2026-08-10)
- **Related:** [ADR-0004](0004-handoff-pipeline-async.md)

## Context

The hand-off writer/fact-extraction stages need a reasoning-capable LLM with structured
(JSON / tool-call) output. The repo already calls Groq's OpenAI-compatible API from
`supabase/functions/techfleet-chat` (`GROQ_MODEL = "openai/gpt-oss-20b"`;
`llama-3.3-70b-versatile` is deprecated 2026-08-16). The requirements doc names capability
requirements (reasoning-capable, tool/function calling, large context, structured JSON I/O)
and a default of `gpt-oss-120b` for writers / `gpt-oss-20b` for mechanical stages, but keeps
functional requirements **model-agnostic**. Provider swap is a real, stated requirement.

## Decision

Access the LLM through a **single hexagonal port** (`generateStructured(input) -> JSON`) with
Groq as the default adapter, reusing the existing `techfleet-chat` idioms: OpenAI-compatible
`chat/completions`, **forced tool-call** for structured JSON, cost metering via
`fleety_record_cost`, and the existing `applyWaf` + `withAuditWrapper` + `dlpScrub` +
prompt-injection/output-sanitization wrappers. Model IDs are configuration, not code: default
`gpt-oss-20b` (verified available), with `gpt-oss-120b` selectable for writer agents once
availability is confirmed on the account. The port stays **minimal** — one interface, one
real adapter — justified by the genuine provider-swap requirement, not a speculative plugin
framework.

Prompt-safety is a first-class part of the port: system instructions are kept separate from
uploaded/retrieved (untrusted) content; tools are constrained, not merely instructed against;
model output is validated/sanitized before use; no secrets are placed in prompts.

## Alternatives considered

1. **Call Groq inline in each stage.** Duplicates auth/cost/safety wrapping across stages and
   hard-codes the provider; a later swap touches many call sites. Rejected.
2. **A generic multi-provider abstraction layer now.** Over-engineered (YAGNI) for one real
   adapter; a single port with config-selectable model IDs meets the requirement. Rejected.

## Consequences

- **Easier:** provider/model is a config change; safety + cost controls are enforced in one
  place; stages depend on a stable JSON contract, not on Groq specifics.
- **Harder / accepted:** the port must define a provider-neutral structured-output contract and
  map provider-specific tool-call shapes into it; `gpt-oss-120b` availability remains an open
  config item (design is unaffected either way).

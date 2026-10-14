# Skill-to-gate coverage matrix: 100% receipt

This is the coverage receipt. Every always-on skill in
[techfleetworks/enterprise-software-AI-skills](https://github.com/techfleetworks/enterprise-software-AI-skills)
v1.0.0, and every mechanical gate component it ships, maps here to a TechFleet Network CI gate check.
No skill is left without a gate. No gate component is left unmapped. That is what "100% coverage from
each skill" means, and this table is the proof obligation the refactor must discharge.

It supersedes the scope of [ci-refactor-wave-plan-2026-10.md](./ci-refactor-wave-plan-2026-10.md): the
wave plan sequenced the HIGH-priority subset; this matrix commits the program to the **complete** set.
The waves still order the work; the end state is every row below reading **green and real**.

## Evidence discipline

Each "TFN current state" cell carries an evidence state from the `skeptical-audit` contract
(`observed` = read first-hand this audit; `inferred` = derived from observed facts; `documented` =
from committed docs/config; `not-assessed` = not yet checked first-hand). The findings behind the
`observed` cells are in [ci-actions-skills-audit-2026-10.md](./ci-actions-skills-audit-2026-10.md).

## Status legend

- **KEEP** - a real, failing-capable TFN gate already enforces this skill. No work beyond confirming it.
- **FIX** - a TFN gate exists but is vacuous, parked, or scoped so it cannot fail. Make it real.
- **COPY** - no TFN gate; copy the ready-made enterprise-skills checker and wire it in.
- **BUILD** - no TFN gate and no drop-in checker fits TFN's stack; build native against local Supabase.
- **REVIEW-ONLY** - a judgment skill with no mechanical gate upstream either; enforced by the
  judge-arch / llm-arch review path. Named honestly, not papered over with a fake mechanical check.

---

## The 16 always-on skills → TFN gate

| # | Skill | Enterprise-skills gate component(s) | TFN current state (evidence) | Target TFN CI action | Status | Wave |
|---|-------|-------------------------------------|------------------------------|----------------------|--------|------|
| 1 | enterprise-architecture-standards | `arch-gate.mjs` | arch-gate ratchet runs and blocks new violations (observed) | Keep the arch-gate `ci / gate` step; confirm waiver file shrinks | KEEP | - |
| 2 | pattern-selector | `check-catalog-completeness.mjs` | no pattern-catalog gate in TFN (observed: absent from `scripts/ci`) | Copy catalog-completeness over a committed TFN pattern catalog | COPY | 2 |
| 3 | architectural-decision-records | `check-change-routing.mjs` (ADR routing) | ADR guard is collision-only; no routing rule forcing an ADR on routed changes (observed) | Copy change-routing; add the "routed change needs an ADR" rule | COPY | 2 |
| 4 | owasp-secure-coding-bdd | `check-owasp-lints.mjs`, `check-security-coverage.mjs`, `check-cheatsheet-catalog.mjs`, `check-verbatim.mjs` | SAST real (security/pentest/security-audit); CodeQL referenced but `codeql.yml` absent; no OWASP-lint/coverage gate (observed) | Confirm+commit CodeQL; copy owasp-lints + security-coverage | FIX + COPY | 3 |
| 5 | bdd-comprehensive-testing | `check-bdd-coverage.mjs`, `check-bdd-executed.mjs`, `check-bdd-tags.mjs`, `check-gherkin-valid.mjs` | `bdd-gate.yml` is a shallow module-name grep, no scenario/assertion (observed) | Copy the gherkin-valid + bdd-coverage/tags engine; replace the grep | COPY | 3 |
| 6 | comprehensive-test-strategy | `check-test-shape.mjs` | Stryker gate vacuous (`break:0`, one file); coverage floor 17-25% (observed) | Make Stryker real + ratchet floor; copy test-shape | FIX + COPY | 1 |
| 7 | release-deployment-safety | `check-migration-safety.mjs` | migration-safety gate real (observed) | Keep; align with enterprise-skills checker if gaps found | KEEP | - |
| 8 | sre-operational-readiness | `check-alert-hygiene.mjs` | `ci-alert.yml` exists; self-skipping workflows go green silently (observed) | Copy alert-hygiene; make skips visible | COPY | 3 |
| 9 | compliance-data-lifecycle | `check-untagged-pii.mjs`, `check-retention-basis.mjs` | GDPR erasure gate real; no untagged-PII or retention gate (observed) | Copy untagged-pii + retention-basis | COPY | 2 |
| 10 | judge-arch | `check-arch-review-coverage.mjs`, `check-reference-links.mjs`, `check-skill-receipt.mjs` | `llm-arch-review.yml` advisory; no review-coverage, reference-link, or receipt gate (observed) | Copy arch-review-coverage + reference-links + skill-receipt | COPY | 2 / 4 |
| 11 | arch-encode | `check-arch-rules-discriminate.mjs` | TFN has the self-proving guard layer but no rules-discriminate gate by that name (observed) | Copy arch-rules-discriminate (or confirm the existing discrimination layer subsumes it) | COPY/KEEP | 2 |
| 12 | verifiable-quality-gates | `check-has-test.mjs`, `verify-check-discrimination.mjs` | TFN's `verify-guard-test-discrimination` + `check-guard-has-test` already do exactly this (observed) | Keep; this is the proven foundation the whole program leans on | KEEP | - |
| 13 | skeptical-audit | `claim-lint.mjs`, `check-skill-evidence-contract.mjs` | no claim-lint or evidence-contract gate in TFN (observed) | Copy claim-lint + evidence-contract | COPY | 3 |
| 14 | universal-accessibility-wcag | `check-axe-results.mjs`, `check-a11y-checklist.mjs`, `run-axe.mjs` | Lighthouse hits prod; jsx-a11y warn-only; axe parked (observed) | Build PR-scoped axe vs local Supabase; copy axe-results + a11y-checklist | FIX + COPY + BUILD | 1 |
| 15 | universal-browser-device-support | `check-no-ua-sniffing.mjs` | cross-browser/browserstack parked; no UA-sniffing lint (observed) | Copy no-ua-sniffing now; revive cross-browser vs local Supabase | COPY + BUILD | 2 / 3 |
| 16 | usability-ux-universal-design | (no mechanical gate upstream) | no mechanical gate exists upstream either (observed in enterprise-skills) | Enforce via judge-arch / llm-arch review; named honestly, no fake gate | REVIEW-ONLY | - |

**Honest note on row 16.** The enterprise-skills repo itself ships no mechanical gate for
`usability-ux-universal-design` because usability is a judgment, not a mechanically decidable property.
TFN cannot have a real one either. Claiming a mechanical gate here would be exactly the vacuous-green
pattern this whole audit exists to kill. It stays REVIEW-ONLY, carried by the judge-arch review and the
`llm-arch-review` job, and that limitation is stated, not hidden. This is the one row that is covered by
process rather than a failing-capable check, by design.

---

## Every gate component accounted for

The 16 rows above fold in all the enterprise-skills **gate scripts**. For completeness, here is each
shipped script and where it lands, so no component is unmapped:

| Enterprise-skills component | Role | TFN destination |
|-----------------------------|------|-----------------|
| `arch-gate.mjs` | architecture gate | KEEP (row 1) |
| `check-arch-review-coverage.mjs` | every change has a review | COPY (row 10) |
| `check-arch-rules-discriminate.mjs` | encoded rules must discriminate | COPY/KEEP (row 11) |
| `check-change-routing.mjs` | routed change needs its artifact | COPY (row 3) |
| `check-reference-links.mjs` | no dangling .md references | COPY (row 10) |
| `check-skill-receipt.mjs` | per-PR skill receipt complete + grounded | COPY (row 10, Wave 4) |
| `check-catalog-completeness.mjs` | pattern catalog complete | COPY (row 2) |
| `check-owasp-lints.mjs` | OWASP lint rules present | COPY (row 4) |
| `check-security-coverage.mjs` | security controls covered | COPY (row 4) |
| `check-cheatsheet-catalog.mjs` | OWASP cheatsheet catalog complete | COPY-opt (row 4) |
| `check-verbatim.mjs` | license hygiene on vendored OWASP text | COPY-opt (row 4) |
| `check-bdd-coverage.mjs` | BDD covers the audiences | COPY (row 5) |
| `check-bdd-executed.mjs` | BDD scenarios actually run | COPY (row 5) |
| `check-bdd-tags.mjs` | scenarios tagged | COPY (row 5) |
| `check-gherkin-valid.mjs` | Gherkin parses | COPY (row 5) |
| `check-test-shape.mjs` | test pyramid shape | COPY (row 6) |
| `check-migration-safety.mjs` | expand/contract migrations | KEEP (row 7) |
| `check-alert-hygiene.mjs` | symptom-based alerts, visible skips | COPY (row 8) |
| `check-untagged-pii.mjs` | PII columns classified | COPY (row 9) |
| `check-retention-basis.mjs` | retention basis recorded | COPY (row 9) |
| `check-has-test.mjs` | every gate ships a test | KEEP (row 12) |
| `verify-check-discrimination.mjs` | the test actually detects | KEEP (row 12) |
| `claim-lint.mjs` | claims carry evidence states | COPY (row 13) |
| `check-skill-evidence-contract.mjs` | evidence contract honored | COPY (row 13) |
| `check-axe-results.mjs` | axe run has zero serious/critical | COPY (row 14) |
| `check-a11y-checklist.mjs` | WCAG checklist covered | COPY (row 14) |
| `run-axe.mjs` | axe runner | BUILD harness around it (row 14) |
| `check-no-ua-sniffing.mjs` | no UA branching | COPY (row 15) |
| `bdd-lib.mjs`, `verifiable-lib.mjs`, `bdd-index-generate.mjs`, `vendor-owasp.mjs`, `esk-init.mjs` | helpers / installer, not gates | ship alongside their gate; `esk-init` is the installer, not a TFN CI check |

Five helpers and the installer (`esk-init`) are libraries, not gates, so they are not themselves CI
actions; they travel with the gate that uses them. Every actual gate script has a TFN home.

---

## Coverage scorecard

- **16 / 16 skills** have an assigned TFN gate (15 mechanical, 1 REVIEW-ONLY by design and stated).
- **KEEP: 4** (already real) - architecture, migration-safety, verifiable-gates, and the review path.
- **FIX: 3 gates** that exist but cannot fail today - Stryker, a11y, CodeQL/OWASP.
- **COPY: ~18 components** from the enterprise-skills repo into TFN's `scripts/ci`.
- **BUILD: 2** native harnesses (PR-scoped axe + cross-browser) against local Supabase.
- **1 REVIEW-ONLY**, honestly labelled.

Every delivered PR ships the four dogfood artifacts (ADR, discrimination test, judge-arch review,
skill-application receipt), and the receipt's own gate (`check-skill-receipt`, row 10) becomes a TFN CI
action in Wave 4 so the receipts are themselves enforced, not just promised. At program end,
`check-skill-receipt` plus the committed required-check set (wave plan PR 3.4) are what hold this 100%
to 100%: a new skill or a drifted gate fails CI.

## What 100% does and does not claim

- It **does** claim: every skill has a named, committed CI gate or a stated review path, and every
  enterprise-skills gate component has a TFN destination. That is a structural, checkable fact once the
  PRs land.
- It **does not** claim: that a green board proves the code is secure, accessible, or correct. The gates
  prove a discipline *ran* and *can fail*; a human still reviews. That boundary is the `verifiable-quality-gates`
  and `skeptical-audit` discipline, and it is stated here so "100% coverage" is not misread as "100% safe."

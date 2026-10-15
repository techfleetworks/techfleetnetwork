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
- **COPY** - a ready-made enterprise-skills **script already exists**; move that script into TFN and
  localize its config. See the critical clarification below - "copy" is honest **only** where a script
  exists.
- **WIRE** - no script of its own, but an existing enterprise-skills script (housed in the `judge-arch`
  folder, the enforcement hub) already enforces this skill. Point TFN at that enforcer; nothing new is
  authored.
- **BUILD** - no TFN gate and no drop-in checker fits TFN's stack; build a native gate against local
  Supabase.
- **RECEIPT-GATED** - a judgment skill that has no *property* gate (no machine can decide "is this
  usable"), but **does** have a real, failing-capable CI gate: the receipt gate. It fails when the
  change has no grounded `applied` entry for the skill, coupled to the surfaces it touches. It proves
  the discipline ran and recorded what it judged, not that the judgment was right.

## Critical clarification: "copy" does NOT mean "every skill has a script"

This was a real imprecision in an earlier draft, and it matters, so it is spelled out here in full.

**The markdown is not the gate.** A skill's `SKILL.md` is prose that a human reads; it never runs. The
*gate* is a separate executable program (a `.mjs` script, or in one case a `.sh` script). "Copy" means
move an **already-written program** into TFN. It never means "translate the markdown into a script."

**And not every skill ships its own program.** Counted directly from enterprise-software-AI-skills
v1.0.0, the 16 skills fall into four buckets, and the action word in the table reflects which bucket a
skill is in:

| Bucket | How many | What exists in the skills repo | TFN action word |
|--------|----------|--------------------------------|-----------------|
| **Own `.mjs` gate(s)** | 11 skills | a script in the skill's own `scripts/` folder (e.g. `check-untagged-pii.mjs`) | **COPY** - move the script + its test, localize its config |
| **Own `.sh` gate** | 1 skill (`architectural-decision-records`) | `check_adr.sh` / `new_adr.sh` (bash, not JavaScript) + a judge-arch enforcer | **COPY** (the shell script) + **WIRE** (the judge-arch enforcer) |
| **No own script; enforced from `judge-arch`** | 3 skills (`enterprise-architecture-standards` → `arch-gate.mjs`; `arch-encode` → `check-arch-rules-discriminate.mjs`; `architectural-decision-records` → `check-change-routing.mjs`) | a script that lives in the `judge-arch` folder and enforces this skill on its behalf | **WIRE** - no new script; point TFN's gate at the existing enforcer |
| **No mechanical script anywhere** | 1 skill (`usability-ux-universal-design`) | nothing executable; usability is a judgment | **RECEIPT-GATED** - the receipt gate is its real, failing-capable check |

So when a row below says **COPY**, a concrete file genuinely exists today and the work is a move plus a
config edit. When a row says **WIRE**, there is no script to copy for that skill specifically - its
enforcement is borrowed from a `judge-arch` script that already exists. When a row says
**RECEIPT-GATED**, there is deliberately no property-checking program, and that is correct, not a gap.
The one thing no row ever means is "write a brand-new gate by hand from the markdown" - that only
happens in the two **BUILD** rows (PR-scoped axe and cross-browser), where TFN's stack genuinely needs a
native harness that the skills repo does not ship.

**What a COPY physically produces** (the untagged-PII gate as the worked example):

1. The script, moved verbatim: `scripts/ci/check-untagged-pii.mjs` (dependency-free, `node:` built-ins only).
2. Its discrimination test, moved verbatim: `test/untagged-pii.test.mjs` (feeds the gate a known-bad and
   a known-good input and asserts the exit codes).
3. Its config/policy data, **localized** to TFN's schema: the PII column-name patterns and the paths to
   scan (e.g. `supabase/migrations/**`). This is the only part you edit, not the logic.
4. One registry line so TFN's existing `gate` aggregator picks the script up. No new workflow file for a
   plain gate; the aggregator already loops over the gate folder.

A **WIRE** produces only step 4 (plus any config), because the script it points at is already present in
the `judge-arch` family TFN imports. A **BUILD** is the only action that authors new logic, and it ships
all of steps 1-4 as new, test-first, against local Supabase.

## Two kinds of gate (why there are no ungated skills)

- **Property gate** - measures the *artifact* and fails on a bad value (axe finds a contrast failure,
  Stryker finds a surviving mutant). Possible only for mechanically decidable properties.
- **Receipt gate** (`check-skill-receipt.mjs`) - measures the *evidence that the discipline ran*. It
  fails when the receipt entry is missing, ungrounded (no verbatim quote from the skill), not bound to
  the changed files, or silently skipped on a surface it was coupled to. Possible for **any** skill,
  including a judgment one.

The receipt gate is a **universal floor under all 16 skills**: every PR must carry a grounded entry for
every skill (applied or not-applicable). Mechanically-decidable skills get a property gate *and* the
receipt; a judgment skill like usability gets the receipt *only* - but that is still a CI check that can
fail, not "trust the review." The honest boundary: the receipt gate proves the usability call was
**made, recorded, and tied to this change**; a human still reads *what* it judged. Grounding, not truth.

---

## The 16 always-on skills → TFN gate

| # | Skill | Enterprise-skills gate component(s) | TFN current state (evidence) | Target TFN CI action | Status | Wave |
|---|-------|-------------------------------------|------------------------------|----------------------|--------|------|
| 1 | enterprise-architecture-standards | `arch-gate.mjs` | arch-gate ratchet runs and blocks new violations (observed) | Keep the arch-gate `ci / gate` step; confirm waiver file shrinks | KEEP | - |
| 2 | pattern-selector | `check-catalog-completeness.mjs` | no pattern-catalog gate in TFN (observed: absent from `scripts/ci`) | Copy catalog-completeness over a committed TFN pattern catalog | COPY | 2 |
| 3 | architectural-decision-records | `check-change-routing.mjs` (housed in `judge-arch`) + `check_adr.sh` | ADR guard is collision-only; no routing rule forcing an ADR on routed changes (observed) | Wire the judge-arch change-routing enforcer + its "routed change needs an ADR" rule; optionally copy the `.sh` helper | WIRE (+COPY .sh) | 2 |
| 4 | owasp-secure-coding-bdd | `check-owasp-lints.mjs`, `check-security-coverage.mjs`, `check-cheatsheet-catalog.mjs`, `check-verbatim.mjs` | SAST real (security/pentest/security-audit); **CodeQL active via GitHub default setup**, no `codeql.yml` needed by design (observed 2026-10-14, analyses ran today); no OWASP-lint/coverage gate (observed) | Copy owasp-lints + security-coverage; no CodeQL work needed | COPY | 3 |
| 5 | bdd-comprehensive-testing | `check-bdd-coverage.mjs`, `check-bdd-executed.mjs`, `check-bdd-tags.mjs`, `check-gherkin-valid.mjs` | `bdd-gate.yml` is a shallow module-name grep, no scenario/assertion (observed) | Copy the gherkin-valid + bdd-coverage/tags engine; replace the grep | COPY | 3 |
| 6 | comprehensive-test-strategy | `check-test-shape.mjs` | Stryker gate vacuous (`break:0`, one file); coverage floor 17-25% (observed) | Make Stryker real + ratchet floor; copy test-shape | FIX + COPY | 1 |
| 7 | release-deployment-safety | `check-migration-safety.mjs` | migration-safety gate real (observed) | Keep; align with enterprise-skills checker if gaps found | KEEP | - |
| 8 | sre-operational-readiness | `check-alert-hygiene.mjs` | `ci-alert.yml` exists; self-skipping workflows go green silently (observed) | Copy alert-hygiene; make skips visible | COPY | 3 |
| 9 | compliance-data-lifecycle | `check-untagged-pii.mjs`, `check-retention-basis.mjs` | GDPR erasure gate real; no untagged-PII or retention gate (observed) | Copy untagged-pii + retention-basis | COPY | 2 |
| 10 | judge-arch | `check-arch-review-coverage.mjs`, `check-reference-links.mjs`, `check-skill-receipt.mjs` | `llm-arch-review.yml` advisory; no review-coverage, reference-link, or receipt gate (observed) | Copy arch-review-coverage + reference-links + skill-receipt | COPY | 2 / 4 |
| 11 | arch-encode | `check-arch-rules-discriminate.mjs` (housed in `judge-arch`) | TFN has the self-proving guard layer but no rules-discriminate gate by that name (observed) | Wire the judge-arch discriminate enforcer, or confirm TFN's existing discrimination layer subsumes it | WIRE/KEEP | 2 |
| 12 | verifiable-quality-gates | `check-has-test.mjs`, `verify-check-discrimination.mjs` | TFN's `verify-guard-test-discrimination` + `check-guard-has-test` already do exactly this (observed) | Keep; this is the proven foundation the whole program leans on | KEEP | - |
| 13 | skeptical-audit | `claim-lint.mjs`, `check-skill-evidence-contract.mjs` | no claim-lint or evidence-contract gate in TFN (observed) | Copy claim-lint + evidence-contract | COPY | 3 |
| 14 | universal-accessibility-wcag | `check-axe-results.mjs`, `check-a11y-checklist.mjs`, `run-axe.mjs` | Lighthouse hits prod; jsx-a11y warn-only; axe parked (observed) | Build PR-scoped axe vs local Supabase; copy axe-results + a11y-checklist | FIX + COPY + BUILD | 1 |
| 15 | universal-browser-device-support | `check-no-ua-sniffing.mjs` | cross-browser/browserstack parked; no UA-sniffing lint (observed) | Copy no-ua-sniffing now; revive cross-browser vs local Supabase | COPY + BUILD | 2 / 3 |
| 16 | usability-ux-universal-design | `check-skill-receipt.mjs` (receipt gate) + judge-arch review | no *property* gate upstream (none is possible); receipt gate covers it (observed) | Receipt gate: a grounded `applied` usability entry, coupled to UI-touching changes, required on every PR; judge-arch reads what it judged | RECEIPT-GATED | 4 |

**Note on row 16.** There is no *property* gate for `usability-ux-universal-design`, because usability
is a judgment, not a mechanically decidable value - claiming one would be the vacuous-green pattern this
audit exists to kill. But the row is **not** ungated: the **receipt gate** (`check-skill-receipt.mjs`)
is a real, failing-capable CI check for it. Every PR must carry a grounded usability receipt entry, and
the coupling rule makes a UI-touching PR with no `applied` usability entry **fail** - that is what stops
the silent skip. The gate proves the usability discipline was applied and recorded what it judged
against this change; judge-arch and a human read *what* it judged. Grounding, not truth. So row 16 is
the one skill with **no property gate**, not the one skill with no gate.

---

## Every gate component accounted for

The 16 rows above fold in all the enterprise-skills **gate scripts**. For completeness, here is each
shipped script and where it lands, so no component is unmapped:

| Enterprise-skills component | Role | TFN destination |
|-----------------------------|------|-----------------|
| `arch-gate.mjs` | architecture gate | KEEP (row 1) |
| `check-arch-review-coverage.mjs` | every change has a review | COPY (row 10) |
| `check-arch-rules-discriminate.mjs` | encoded rules must discriminate | WIRE/KEEP (row 11, housed in judge-arch) |
| `check-change-routing.mjs` | routed change needs its artifact | WIRE (row 3, housed in judge-arch) |
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

- **16 / 16 skills** have a real, failing-capable TFN gate. 15 get a property gate; all 16 (including
  usability) sit under the receipt gate as a universal floor. Zero ungated skills.
- **KEEP: 4** (already real) - architecture, migration-safety, verifiable-gates, and the review path.
- **FIX: 2 gates** that exist but cannot fail today - Stryker and a11y. (CodeQL was mis-flagged; it is
  active via GitHub default setup. See the audit correction.)
- **COPY: ~16 components** from the enterprise-skills repo into TFN's `scripts/ci` (a script genuinely
  exists for each).
- **WIRE: 2 skills** (`arch-encode`, `architectural-decision-records`) whose enforcer lives in the
  `judge-arch` family - no new script, just point TFN at it.
- **BUILD: 2** native harnesses (PR-scoped axe + cross-browser) against local Supabase.
- **1 receipt-gated-only** (usability) - a real CI check, just not a property gate.

Every delivered PR ships the four dogfood artifacts (ADR, discrimination test, judge-arch review,
skill-application receipt), and the receipt's own gate (`check-skill-receipt`, row 10) becomes a TFN CI
action in Wave 4 so the receipts are themselves enforced, not just promised. At program end,
`check-skill-receipt` plus the committed required-check set (wave plan PR 3.4) are what hold this 100%
to 100%: a new skill or a drifted gate fails CI.

## What 100% does and does not claim

- It **does** claim: every skill has a real, failing-capable CI gate (a property gate, a receipt gate,
  or both), and every enterprise-skills gate component has a TFN destination. That is a structural,
  checkable fact once the PRs land.
- It **does not** claim: that a green board proves the code is secure, accessible, or correct. The gates
  prove a discipline *ran* and *can fail*; a human still reviews. That boundary is the `verifiable-quality-gates`
  and `skeptical-audit` discipline, and it is stated here so "100% coverage" is not misread as "100% safe."

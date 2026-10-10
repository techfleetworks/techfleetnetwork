# Audit — Architectural Decision Record discipline (TechFleet Network)

**Auditor dimension:** ADRs only — coverage, quality, format, status lifecycle, decision-with-code, discoverability, numbering hygiene.
**Scope read-only:** `C:/Users/morga/Documents/tfn-audit`
**Date:** 2026-10-09
**Standard applied:** bundled `architectural-decision-records` SKILL.md + references (madr-template, nygard-template, lifecycle, writing-guide).

## Score: 83 / 100 — Band: enterprise-ready with gaps (75–89)

74 ADRs + README across `docs/adr/` for a ~767-user app is unusually disciplined. The *why* is genuinely captured, decisions ship with code, status/supersession is tracked, and the number-collision problem has a real root-cause fix. Points lost on a stale index (75% of ADRs uncatalogued), three still-doubled legacy numbers, and one renumber-vs-commit-message traceability break.

---

## Weighted sub-criteria

| # | Criterion | Weight | Score | Weighted |
|---|-----------|--------|-------|----------|
| 1 | Coverage of significant decisions | 25% | 92 | 23.0 |
| 2 | Record quality (MADR/Nygard: context/drivers/≥2 options/honest consequences) | 25% | 88 | 22.0 |
| 3 | Status lifecycle + supersession | 15% | 90 | 13.5 |
| 4 | Committed-with-code / in-flow (not retrofitted) | 15% | 85 | 12.75 |
| 5 | Discoverability / index | 10% | 50 | 5.0 |
| 6 | Numbering / collision hygiene | 10% | 70 | 7.0 |
| | **Total** | 100% | | **83.25** |

---

## Evidence

### Criterion 1 — Coverage (92)
- **VERIFIED.** 74 ADR files (`docs/adr/*.md`, Glob). Major areas all covered: auth (0049 idle timeout, 0054 app-owned refresh, 0064 code-based signup), email pipeline (0013/0014/0016/0017/0018 + 0040 enqueue), membership (0037 ledger, 0038 identity, 0042 purchase side-effects, 0070 clawback), Discord (0053 role, 0063 connect timeout/idempotency), data-access (0056 column grant, 0071 service layer), stats (0050), schema gates (0020→0035→0036, 0052), CI-guard integrity (0019, 0022–0024, 0029, 0043, 0046, 0047), AI/Fleety (0005, 0009–0011, 0013-lexical, 0034, 0044, 0073).
- **Limitation:** cannot prove *no* significant decision went unrecorded without a full diff-vs-ADR reconciliation across all merged PRs; coverage judged from the ADR corpus + memory index, not an exhaustive code sweep.

### Criterion 2 — Quality (88)
- **VERIFIED.** `0001-spf-single-source-of-truth.md:42-69` — 3 real alternatives each with why-rejected, consequences split into easier / harder-accepted-risk / external-dependency (honest costs stated). `0073-fleety-braintrust-observability.md:58-65` — 5 considered options, explicit "Accepted / costs" block, governance follow-ups. `0016-tal-9000-future-mode-terminal.md:36-42` — even an "easter-egg" UI feature carries Decision/Security/Consequences/Rollback; "Temporary duplication" named as an accepted cost. `20261009-ci-cache-supabase-images.md:51` — "honest reduction, not an absolute guarantee." No thin stubs found in the ~12 sampled.
- `Grep` confirms **every** ADR file has a Consequences/Alternatives section (74/74).
- **Minor:** two header conventions coexist — MADR-ish `- **Status:** / ## Context / ## Alternatives considered` (0001, 0013-consent) vs a lighter `- Status: / - Date: / ## Decision` (0013-lexical, 0016-tal, 0073). Both are legitimate (README declares the lighter "Status/Context/Decision/Alternatives/Consequences" house format), but the mix means no single machine-checkable schema. Confirmation/fitness-function sections are present in gate ADRs but not universal.
- **Limitation:** quality judged on a ~12-ADR sample (early 0001; collided 0013×2/0016-tal; gate 0019; recent 0065/0073; date-prefixed 20261009), not all 74.

### Criterion 3 — Status lifecycle + supersession (90)
- **VERIFIED.** 74/74 files carry a Status line (`Grep` count). Supersession is bidirectional and immutable-respecting: `0013-consent...:3` and `0014-ghost...:3` → "Superseded by ADR-0017"; chain `0020:3` → 0035 → `0035:3` → 0036, each retaining "(was: Accepted, date)". Matches `references/lifecycle.md` (supersede, never rewrite).
- **Minor drift:** `0015-mui-owned-design-system-layer.md:3` has sat **Proposed** since 2026-08-22 (~7 weeks) while describing a live shadcn/ui tree it proposes to replace; a long-lived "Proposed" with no ratify/reject is lifecycle rot, not a contradiction (it correctly does *not* claim to be shipped).

### Criterion 4 — Committed with code, not retrofitted (85)
- **VERIFIED.** `git show --stat afa0b2058` (ADR-0065) — the ADR lands in the **same commit** as its code, tests, and `arch-gate.config.json` change (16 files: `0065-...md` + `src/pages/*`, `src/lib/applications/*`, `*.test.ts`, smoke tests). This is the skill's core rule satisfied. Commit subjects routinely cite the ADR id (`git log`: "...(ADR-0065) (#401)", "...(ADR-0068) (#417)").
- **HIGH finding:** `git log` shows the Braintrust feature merged as **`f8a2a6618 feat(observability): ... (ADR-0066) (#413)`**, but the ADR file is **0073** (renumbered 0066→0073 on merge, noted in `0073-...:8`). The merged commit message still says ADR-0066, so `git log --grep ADR-0073` will not find the implementing commit — a traceability break created by the renumber-on-merge problem the date scheme exists to kill.

### Criterion 5 — Discoverability / index (50) — weakest
- **VERIFIED.** `README.md` index **table lists only ADR-0001 through 0018** (`README.md:31-45`); 0019–0073 and the date-prefixed ADR have **no catalogue row** — ~56 of 74 ADRs (75%) are discoverable only by browsing filenames. The README's own prose (`:47-52`) still describes the corpus as if it ends in the email-rearchitecture block. No generated/CI-checked index (no guard asserts README lists every file).
- **Mitigant:** filenames are descriptive kebab-case and the collision guard counts them, so the directory is a serviceable de-facto index — but the curated index is badly stale.

### Criterion 6 — Numbering / collision hygiene (70)
- **VERIFIED.** Three legacy numbers are still **doubled** on disk: `0013` (consent-ledger + fleety-retrieval), `0014` (ghost-sync + fleety-file-uploads), `0016` (email-tiering + tal-9000). `check-adr-number-collision.mjs:49-53` grandfathers exactly these three and blocks a *third* file or any *new* legacy collision. So "ADR-0013/0014/0016" remain **ambiguous references** — real, but contained and acknowledged.
- **README inaccuracy (LOW):** `README.md:18` claims the guard keeps "legacy numbers... unique (frozen)"; they are not unique (three doubled) — the guard *caps* them, it doesn't make them unique. Cosmetic wording vs the code.
- **Gaps 0058/0059/0062:** not dangling — `0063-...:66,100,125,133` reference 0058/0059 as the in-flight `feat/applicant-status-event-fanout` branch; 0062 is an unmerged branch (system-health) per project memory. Numbers consumed on open branches, a pre-date-scheme artifact.
- **Strong root-cause fix:** the YYYYMMDD-slug migration (`README.md:8-29`, guard `:9,55-61`, first use `20261009-ci-cache-supabase-images.md`) mirrors the DB-migration timestamp convention and is mechanically enforced with a committed smoke test — the correct, durable answer to the collision class.

---

## Ranked findings

| Rank | Finding | Evidence | State |
|------|---------|----------|-------|
| HIGH | ADR index (README table) covers only 0001–0018; ~75% of ADRs uncatalogued, no CI check that README lists every file. | `README.md:31-52` | VERIFIED |
| HIGH | Renumber-on-merge breaks commit↔ADR traceability: Braintrust merged as "ADR-0066" but file is 0073. | `git log f8a2a6618`; `0073-...:8` | VERIFIED |
| MEDIUM | Three legacy numbers still doubled → ambiguous "ADR-0013/0014/0016" references. | `check-adr-number-collision.mjs:49-53` | VERIFIED |
| MEDIUM | ADR-0015 stuck "Proposed" ~7 weeks against a live contrary implementation (shadcn); no ratify/reject. | `0015-...:3,10` | VERIFIED |
| LOW | README claims legacy numbers are "unique (frozen)" — they're capped, not unique. | `README.md:18` vs grandfather map | VERIFIED |
| LOW | Two coexisting header formats → no single machine-checkable ADR schema. | 0001 vs 0073 headers | VERIFIED |

No CRITICAL: for a docs dimension CRITICAL is reserved for `decisions.md` rules contradicting shipped code; none found in the ADR dimension (0015 is a *Proposed* aspiration, not a shipped-contradicting rule).

## Strengths (credit earned)
1. **ADRs ship with the code** — verified in one commit for 0065 (ADR + impl + tests + gate config together); the single hardest part of ADR discipline, and they do it.
2. **Genuine MADR-grade quality + lifecycle** — honest "Bad, because" consequences, ≥2 real alternatives, bidirectional supersession chains (0020→0035→0036), 100% status coverage, and a root-cause date-prefix fix for the collision class that is itself CI-guarded.

## Biggest limitation of this audit
Quality was sampled (~12 of 74 ADRs) and coverage was judged from the ADR corpus + the project memory index, **not** from an exhaustive merged-PR-diff-vs-ADR reconciliation — so an un-recorded significant decision (an ADR that should exist but doesn't) would not necessarily surface here. The findings above are about the ADRs that *do* exist.

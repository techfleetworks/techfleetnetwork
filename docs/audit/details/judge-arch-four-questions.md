# judge-arch — Four-Questions codebase audit — TechFleet Network

Scoped to: the WHOLE `tfn-audit` tree (read-only) against `decisions.md` + CLAUDE.md, assessing
standing architectural health (not a single diff). Audited ONLY the four questions.
Date: 2026-10-09. Reviewer: fresh-context skeptical architect.

**SCORE: 74 / 100 — band: adequate, material risk (borderline enterprise-ready).**

Weighting: Boundary 30% · Error 25% · Ownership 25% · Dependency 20% (boundary + error heaviest,
per the skill). Q1 0.30·60=18.0 · Q4 0.25·82=20.5 · Q2 0.25·78=19.5 · Q3 0.20·80=16.0 → **74.0**.

Headline tension: **exemplary enforcement machinery sitting on a large inherited boundary debt.**
The gate system (ratchets, discriminating guards, fail-closed meta-guards, shrink-only budgets) is
better than most enterprises run; the UI→DB boundary is still violated at scale, contained but not
yet paid down.

---

## Skeptical correction to the brief
The task states the waiver file holds **~1525 entries**. VERIFIED it holds **305**.
Source: `ConvertFrom-Json (arch-gate.waivers.json) | Measure` → 305; `Group-Object rule`:
- 103 — Edge functions must not hand-roll CORS or responses in the handler
- 100 — UI must not access the database directly
-  93 — Edge functions must not hand-roll auth or read service-role secrets in the handler
-   6 — Services must not import UI or touch web globals
-   3 — "keep in sync" marker (two copies of one fact)
All 305 are `approvedBy: "baseline"`, `expires: ""` (none time-boxed). Evidence state: VERIFIED.
Limitation: counts stale-but-harmless waivers (a file fixed but its baseline entry not pruned — see Q1).

---

## Q1 — Boundary placement — **FAIL** · ~55 live UI files (100 waived baseline)
**Where:** `src/components/**`, `src/pages/**`.
Direct `supabase.(from|rpc|storage|functions)` calls inside components/pages — the exact pattern
`decisions.md §1` bans ("UI never touches Supabase directly").
- Re-runnable: `rg 'supabase\.(from|rpc|storage|functions)\b' src/components src/pages -l`
  → 37 component files + 18 page files (minus CLAUDE.md doc) ≈ **55 live files**. VERIFIED.
- Business logic fused with display, not just reads: `src/components/clients/ClientsTab.tsx`
  (lines 149–265) does insert + logo-update + update + delete + edit inline in the component;
  `src/components/admin/FleetyPlaybooksManager.tsx` (114–196) owns full CRUD for two tables.
  These are workflows trapped in one caller — the next surface that needs "manage playbooks" must
  copy it. VERIFIED (file:line read via grep content).
**What breaks if ignored:** a schema/RLS change to `clients`/`projects`/`fleety_*` touches dozens
of components instead of one service; every new surface re-implements the same read/write. This is
already the live cause pattern behind the Projects `select('*')` 403 outage (ADR-0065) — scattered
read paths each had to be found and fixed.
**Smallest fix:** continue the in-flight `projectService`/`useProject` seam (per memory, PR2 open)
and extend the same hook-per-table pattern to `clients`, `fleety_*`, chat, and journey_progress;
prune baseline waivers as each file clears so the backlog number tells the truth.
Rank: **HIGH** (systemic, but gated against new ones and actively burning down).
Mechanical status: PASS (all live sites appear in the 100-entry baseline; gate blocks only NEW ones).
Limitation: did not byte-diff each of the 55 live paths against the 100 waiver paths; 55<100 implies
~45 stale waivers OR a few live files are multi-rule — UNVERIFIED which.

## Q2 — Data ownership — **PASS (with findings)** · 1 named multi-writer class
**Strengths (credit):**
- **Zero raw `profiles.update/insert/upsert` in UI.** `rg "from\(['\"]profiles['\"]\)\.(update|insert|upsert)" src`
  → only CLAUDE.md prose + test fixtures. The `ProfileService` mass-assignment boundary holds. VERIFIED.
- **Displayed stats are live-derived and mechanically enforced** — `arch-gate.config.json` forbids
  `.from('course_completion_stats'|'network_stats_snapshots')` under `src/**` (ADR-0050). VERIFIED (config read).
**Finding — `freescout_customer_id` still has multiple writers.** `decisions.md §2` names this the
canonical anti-pattern ("written by 3 functions on 2 different keys"). Still touched by 5 edge
functions + 1 shared owner: `freescout-provision-customer`, `freescout-sync-customer`,
`freescout-proxy`, `process-freescout-events`, `support-provisioning-retry`, `_shared/support-ticket.ts`.
- Re-runnable: `rg freescout_customer_id supabase/functions -l`. VERIFIED (file list); the
  read-vs-write split per file is UNVERIFIED (did not open all 6).
**What breaks if ignored:** the two copies drift; a customer linked on one key is invisible on the
other → duplicate Freescout customers / lost support identity.
**Smallest fix:** route every write through `_shared/support-ticket.ts` keyed on an immutable id;
others read. Rank: **MEDIUM** (known, bounded, a shared owner already exists to converge on).

## Q3 — Dependency direction — **PASS (with findings)** · 6 waived web-global leaks
**Where:** `src/services/**`. `decisions.md §3` / `src/services/CLAUDE.md` forbid `window`/`document`/
`localStorage` in services.
- Re-runnable: `rg "window\.|document\.|localStorage" src/services`.
- `stats.service.ts` (74–89) and `announcement.service.ts` (42–55) read/write `window.localStorage`
  directly instead of routing through `src/lib/cached-session.ts` / `memory-cache.ts` as the rule
  requires; `push-subscription.service.ts:300` (`window.matchMedia`) and `error-reporter.service.ts`
  (`window.addEventListener` global handlers) also touch web globals. VERIFIED (file:line).
**What breaks if ignored:** these services can't run/test in Node without a browser shim; the
last-known-good caches drift from the one cache owner. `error-reporter`'s global listeners are
arguably mis-placed in `services/` vs `lib/` (it IS a web adapter).
**Smallest fix:** move the LKG caches behind `src/lib/*` adapters (the rule's stated escape hatch);
leave `error-reporter` as a documented boundary adapter or relocate to `lib/`.
Rank: **LOW** (6 sites, all waived, bounded; `src/lib` is legitimately the web-adapter layer).

## Q4 — Error handling — **PASS (with findings)** · ~10 dropped-error burn-down sites
**Strengths (credit) — this is the strongest dimension:**
- Real reporting infra: `error-reporter.service.ts` (~900 lines), `invokeEdge`/`auditedInvoke`
  (report + retry), the symmetric classifier drop → `recordClassifiedDrop` aggregate (ADR-0031/0021).
- **~124 edge `index.ts` wrap `withAuditWrapper`** (uncaught throw → `edge_function_error` audit row).
  Re-runnable: `rg withAuditWrapper supabase/functions -c` → 254 occurrences / 127 files. VERIFIED.
  (NOTE: my first grep with a `*/index.ts` glob false-negatived to "no files" — a reminder to verify
  reality, not the first query; re-ran without the glob.)
- Mechanical backstops: `no-dropped-supabase-error` ESLint + shrink-only budget, `suppressforward-has-report`,
  report-no-silent-drop AST guard — all fail-closed.
**Finding — residual dropped `{ data }` (no `error`) sites, grandfathered/shrinking (ADR-0032):**
`hooks/useUgcTranslation.ts:67`, `services/general-application.service.ts:55`,
`hooks/useFleetyChat.ts:59,69`, `services/explore.service.ts:176`, `services/class-emails.ts:22`,
plus UI (`ApplicantStatusDropdown`, `MyProjectsTab`, `FleetyChatWidget`, `GuidanceEmbed`, `ChatPage`).
≈10 non-auth sites. Re-runnable: `rg "const \{ data \} = await supabase" src`. VERIFIED.
(The `supabase.auth.getSession()` hits are a different, frozen-auth shape — excluded.)
**What breaks if ignored:** a failed Fleety-chat / translation / application read returns null with
nothing knowing why → blank data / infinite skeleton with no operator signal.
**Smallest fix:** take `{ data, error }` + `if (error) throw/report`; the shrink guard already forces
these to zero over time. Also: `emptyCatch`/`swallowReturn` builtins are intentionally OFF (config
line 5) — Q4 mechanical coverage of swallowed catches is deferred to this review; the `.catch(()=>{})`
sites found (`VideoRecorder`, `FleetyHealthTab` clipboard, `explore.service` resp.text) are benign
fire-and-forget. Rank: **MEDIUM** (bounded, decreasing, strong surrounding discipline).

---

## Mechanical gate status
`npm run check:architecture` (scripts/ci/arch-gate.mjs) NOT executed — Node run + flaky msys fork;
exit code **UNVERIFIED**. Config + 305-entry baseline are structurally intact and every live
violation sampled maps to the baseline, so the gate is expected green; the review half (this report)
is **not** all-PASS (Q1 FAIL), so the combined gate would require waiving/accepting the Q1 findings.

## Verdict per question
- Q1 Boundary placement — **FAIL** — ~55 live UI files direct-to-DB (100 baseline waivers).
- Q2 Data ownership — **PASS w/ findings** — 1 multi-writer class (`freescout_customer_id`); 0 raw profiles.update.
- Q3 Dependency direction — **PASS w/ findings** — 6 web-global leaks in services (waived).
- Q4 Error handling — **PASS w/ findings** — ~10 dropped-error burn-down sites; infra exemplary.

## Biggest limitation of this audit
Static grep over a read-only snapshot: no `tsc`/eslint/gate execution, so mechanical exit codes are
inferred not run; the 55-live-vs-100-waived delta was not reconciled file-by-file; read-vs-write
split of the freescout writers not opened. Findings are structural signals, not a line-certified count.

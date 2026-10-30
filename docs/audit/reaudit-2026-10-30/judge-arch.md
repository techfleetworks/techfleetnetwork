# judge-arch re-audit: the four questions, whole codebase

Date: 2026-10-30. Tree: `tfn-reaudit` at `e4c366190` (origin/main, 2026-10-17, #437). Read-only.
Standard used: `decisions.md` sections 1 to 6, `CLAUDE.md`, `src/components/CLAUDE.md`,
`src/services/CLAUDE.md`, `supabase/functions/CLAUDE.md` (all `documented`, read this session).
Prior baseline: `docs/audit/details/judge-arch-four-questions.md` (2026-10-09, score 74).

## Score

**70 / 100. Band: adequate, material risk (60 to 74).** Delta vs prior: **-4**.

| Question | Weight | Score | Verdict | Prior |
|---|---|---|---|---|
| Q1 Boundary placement | 30% | 60 | **FAIL** | 60, FAIL |
| Q4 Error handling | 25% | 72 | **PASS with findings** (borderline) | 82 |
| Q2 Data ownership | 25% | 72 | **FAIL** (one High) | 78, PASS w/ findings |
| Q3 Dependency direction | 20% | 80 | **PASS with findings** | 80 |

0.30x60 + 0.25x72 + 0.25x72 + 0.20x80 = 18 + 18 + 18 + 16 = **70**.

Read the delta honestly: most of the -4 is **measurement, not regression**. The prior audit counted
about 10 dropped-error sites; an exhaustive grep this time finds 31 in `src` and 157 in edge
functions, and the ESLint guard that the prior audit credited as "un-regressable" is blind to 45%
of the edge sites. The Q2 drop comes from a newly found High (applicant can self-write
`applicant_status`, per the repo's migrations). Real progress since 2026-10-09 is small but real:
ADR-0071 PR2 (#415) and PR3 (#421) merged, the Welcome Flow PR2 (#439) shipped with a clean
service seam, and #427 made every waiver carry an expiry.

## Mechanical gate (run this session)

| Check | Command | Result | State |
|---|---|---|---|
| arch-gate, full scan | `node scripts/ci/arch-gate.mjs` | `scanned 1986 file(s) / PASS - no architecture violations. (856 waived)`, exit 0 | observed |
| dropped-error budget shrink | `node scripts/ci/check-dropped-supabase-error-budget-shrinks.mjs` | OK, 58 files, 114 sites, baseline 114, exit 0 | observed |
| raw-invoke budget shrink | `node scripts/ci/check-raw-invoke-budget-shrinks.mjs` | OK, 25 files, 48 invokes, baseline 48, exit 0 | observed |
| inline role authz | `node scripts/ci/check-no-inline-role-authz.mjs` | OK, 169 files, 28 grandfathered, 0 new, exit 0 | observed |
| edge CORS trace | `node scripts/ci/check-edge-cors-trace.mjs` | OK, 36 targets, exit 0 | observed |
| suppressForward has report | `node scripts/ci/check-suppressforward-has-report.mjs` | ERR_MODULE_NOT_FOUND (needs node_modules), exit 1 | not-assessed |

CI wiring: `ci.yml` job `arch-gate` runs `npm run check:architecture` = `arch-gate.mjs --changed`,
and is in the required `gate` aggregator (documented, `ci.yml:386-466`). `llm-arch-review.yml` is
advisory (`ENFORCE` commented out). Not re-verified in GitHub branch protection (not-assessed).

### Waivers (`arch-gate.waivers.json`)

Source: `node -e` tally over the file, plus scratch script
`C:\Users\morga\AppData\Local\Temp\claude\C--Users-morga-Documents\eb278155-1eeb-43c5-b921-db4953279b71\scratchpad\stale-waivers.mjs <repo>`
(re-applies each rule's forbid regex to each waived file). All observed.

| Rule | Waivers | Still live | Stale |
|---|---|---|---|
| UI must not access the database directly | 100 | 89 | 11 |
| Edge must not hand-roll CORS/responses | 103 | 102 | 1 (file deleted) |
| Edge must not hand-roll auth / service-role key | 93 | 92 | 1 (file deleted) |
| Services must not touch web globals | 6 | 6 | 0 |
| "keep in sync" marker | 3 | 3 | 0 |
| **Total** | **305** | **292** | **13** |

- Count history (git show of the file at each commit): 313 before #396, 306 after, 305 after #415,
  305 today. **Net change since the prior audit: 0.** PR3 #421 migrated 5 components but pruned no
  waivers (those files still have other direct DB calls).
- Expiry: **all 305 expire on one date, 2027-04-30** (182 days out). 0 expired, 0 undated
  (the #427 check is live, `arch-gate.mjs:69-92`). All `approvedBy: "baseline"`.
- Stale: 11 UI waivers for files that no longer violate (e.g. `src/components/DiscordRolePicker.tsx`,
  `src/pages/DsarSubmitPage.tsx`, `src/components/ProfileEditPanel.tsx`) and 2 for the deleted
  `supabase/functions/resolve-discord-id/index.ts`. Nothing fails on a stale waiver.
- 856 waived occurrences sit behind 305 file-level waivers. A waiver covers the whole file with no
  count (`arch-gate.mjs:181-187`), so a waived file can gain new violations of the same rule and
  still pass (JA-9).

## Violation counts (exact greps, all run this session)

| What | Grep (ripgrep) | Count | Prior |
|---|---|---|---|
| UI files with direct data calls | `supabase\.(from\|rpc\|storage\|functions)\b` in `src/{components,pages,app,routes}/**/*.{ts,tsx}` | **52 files, 110 calls** | ~55 files |
| UI files the gate rule matches (calls or client import) | above OR `from ['"]@/integrations/supabase/client['"]` | **88 files, 198 hits** | not measured |
| Raw `functions.invoke(` in `src` | `functions\.invoke\(` excl tests | 27 in 19 files (budget file: 48 in 25) | - |
| Dropped `{ data }` in `src` (non-test) | `\{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await\s+(supabase\|admin\|client\|...)\b` | 35 hits; **31 non-auth**, of which **25 in components/pages** | ~10 |
| Dropped `{ data }` in edge | multiline `\{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await\s+\w+\s*\n?\s*\.(from\|rpc)\(` in `supabase/functions` | **157 in 70 files** | not measured |
| ...of those, rooted at a name the ESLint rule cannot see | root not matching `^(supabase\|.*[Cc]lient)$` (`admin` 55, `svc` 14, `sb` 1, `adminCheck` 1) | **71 of 157 (45%)** | - |
| Empty catch (whitespace body) | `catch\s*(\([^)]*\))?\s*\{\s*\}` in src + edge | **0** | - |
| Comment-only one-line catch | `catch\s*(\(...\))?\s*\{\s*(/\*[^*]*\*/\|//...)?\s*\}` | 28 in 15 `src` files, 4 in 4 edge files | - |
| `.catch(() => {}/null/undefined/false/[])` | `\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}\|null\|undefined\|false\|\[\])\s*\)` | 50 in 35 files (7 are in smoke tests) | - |
| `catch { return null/false/[]/{} }` | multiline, src + edge | 59 in 46 files | - |
| Services touching web globals | `window\.\|document\.\|localStorage\|sessionStorage\|from ['"]react` in `src/services` | 6 files (all waived) | 6 |
| Edge handlers > 300 lines | PowerShell line count of each `index.ts` | 25 of 125; 7 over 500; `techfleet-chat` 2490 | - |
| Edge fns wrapped in `withAuditWrapper` | `Select-String -SimpleMatch withAuditWrapper -List` over `index.ts` | 125 of 125 | 124-127 |

### True-positive rate (deep-read sample)

- UI direct data access: 10 files read (UserAdminPage, ProjectFormPage, ApplicantStatusDropdown,
  MyProjectsTab, NotificationSettingsPage, EditProfilePage, ClientsTab, FleetyPlaybooksManager via
  grep context, FleetyChatWidget, ChatPage). **10 of 10 true positives** against decisions.md section 1;
  4 of 10 also hold business rules, not just reads (JA-1, JA-4, JA-5, ClientsTab/FleetyPlaybooks).
- Dropped `{ data }`: 12 sites read. **12 of 12 drop the error for real.** Impact ranges from
  cosmetic (milestone chips empty) to a fail-open guard (JA-3).
- Comment-only catches: 15 read. **1 of 15 is a real hide** (`process-notification-fanout/index.ts:49`);
  the rest are storage-disabled, URL-parse, or telemetry-must-not-throw recoveries. About 7%.
- `.catch(() => x)`: 23 read. **2 of 23 real** (`ItemEditorDialog.tsx:88` shows "no attachments" on
  a fetch failure; `ProjectFormPage.tsx:365` swallows the Discord notify). Rest are body drains and
  parse fallbacks that are checked right after. About 9%.
- `catch { return null }`: 7 read. **1 of 7 arguable** (`_shared/feature-flags.ts:56`, a flag DB
  outage reads as "off" with no signal). Rest are JWT/URL/base64 parse recovers.

Limitation for all counts: regex, not AST. Multi-line destructures with odd spacing, `(await x).data`,
and wrapper-wrapped calls are missed, so the dropped-error counts are a floor.

## Findings

Severity: High = data integrity, security, or a boundary break that forces duplication; Med =
correctness or maintainability; Low = real but small.

| ID | Q | Sev | Where | What | What breaks if ignored | Evidence state | Re-runnable source | Limitation | Smallest fix (prevent -> gate -> test) |
|---|---|---|---|---|---|---|---|---|---|
| JA-1 | Q1 boundary | **High** | `src/components/admin/ApplicantStatusDropdown.tsx:140-215` | The status-transition rules live only in the UI: "invite to interview needs a scheduling URL" and "active participant needs a project Discord role AND a linked applicant Discord". The server `notify-applicant-status/index.ts:427-440` writes the status first and only does a best-effort role grant at `:615-640`. | Any other caller (a second admin surface, a script, a direct invoke) can set `active_participant` with no Discord role, or `invited_to_interview` with no link (email silently skipped at `:533`). The next surface must copy these checks or skip them. | observed (both files read) | Read the line ranges named; `rg "discord_user_id\|discord_role_id" supabase/functions/notify-applicant-status/index.ts` | Did not trace `mark-interview-scheduled`'s own preconditions. | Move both preconditions into the server (an `assertTransitionAllowed` in `_shared` or a DB transition function) and have the UI only display the server's refusal. Gate: an arch-gate rule forbidding `newStatus ===` branches in `src/components/**`. Test: a Deno test that `active_participant` without a role returns 409. |
| JA-2 | Q2 ownership (+security) | **High** | `supabase/migrations/20260318004034_...sql:37-43` | Per the repo's migrations, RLS lets an applicant INSERT and UPDATE their own `project_applications` row with no column limit, and no trigger guards `applicant_status`. So a member could write `applicant_status = 'active_participant'` on their own row. That flag gates `handoff_is_active_member()` (`20260810180000_handoff_intake.sql:9-17`). The status has three writers: the applicant (via RLS), `notify-applicant-status:430`, `mark-interview-scheduled:150`. | Self-promotion to "active teammate": hand-off access, roster display, community-agreement prompts, all keyed on a value the subject can write. | **inferred** (from repo migrations only) | `rg -i "ON (public\.)?project_applications" supabase/migrations`; `rg "applicant_status\s*:=\|NEW\.applicant_status" supabase/migrations` (only broadcast reads); `rg -i "ALTER POLICY\|REVOKE UPDATE\|GRANT UPDATE \(" supabase/migrations` (0 hits) | Prod has no migration ledger, so live `pg_policies` and column grants were NOT queried. A dashboard-applied fix could exist. Must be confirmed in prod before acting. | Prevent: BEFORE INSERT/UPDATE trigger that rejects any `applicant_status` change unless the caller is admin or service_role (insert forced to the default), or column-level `REVOKE UPDATE (applicant_status)`. Gate: a pgTAP test in the db-schema gate. Test: pgTAP as `authenticated` attempts the self-update and must get 42501. Hand off to the security and database auditors. |
| JA-3 | Q4 error | Med | `supabase/functions/notify-applicant-status/index.ts:417-424` | The "no interview statuses on no-interview projects" guard drops `error`: `const { data: projectFlag } = await supabase...`. On a query error `projectFlag` is null and the guard is skipped. | A transient PostgREST error lets a blocked status through. The guard fails open. | observed | Read the lines | Single site; other fail-open guards not hunted exhaustively. | Take `{ data, error }`; on error return 503. The ESLint rule already covers this root name (`supabase`), so it is budgeted, not new; burn it from the budget. |
| JA-4 | Q1 boundary + Q4 | Med | `src/pages/ProjectFormPage.tsx:337-370, 373-420, 425-456` | The page owns project create/update writes (`supabase.from("projects").insert/update`), a change-diff builder, and the Discord "project updated" notification. The notify uses raw `supabase.functions.invoke`, whose `{error}` is never read, inside `catch { // non-critical - ignore }`. | Projects changed from any other surface never post to Discord; every Discord notify failure is invisible to operators (decisions.md section 4: "every failure reports"). ADR-0071 PR4 (writes) is not done. | observed | `rg -n "supabase\.(from\|functions)" src/pages/ProjectFormPage.tsx`; read the ranges | - | Finish ADR-0071 PR4: `projectService.create/update` emits the notify server-side (or via `invokeEdge`, which reports). Delete the page's catch. |
| JA-5 | Q4 error + Q1 | Med | `src/pages/UserAdminPage.tsx:158-178` | Role and pending-promotion reads drop `error` (`{ data: roles }`, `{ data: promos }`, `{ data: teacherPromos }`). The page also builds admin/teacher sets, pages `admin_list_users`, and holds the only client step-up-2FA retry (`:56-125`). | On an RLS or transient failure every admin shows as non-admin and an admin may re-promote. The `user_roles` read is unpaged (the same 1000-row cap the comment at `:133-137` fixed for accounts), so if `user_roles` passes 1000 rows the flags silently truncate (inferred; row count not checked). | observed (drops); inferred (truncation) | Read `:56-190` | Did not count `user_roles` rows in prod. | Move to a `userAdminService.listUsers()` that takes `{data,error}`, pages, and throws. UI files are outside the ESLint rule's scope, so add an arch-gate rule (JA-7). |
| JA-6 | Q4 error (gate gap) | Med | `scripts/lint/eslint-plugin-no-dropped-supabase-error.mjs:57` | `CLIENT_ROOT = /^(supabase\|.*[Cc]lient)$/`. The most common edge client name, `admin` (55 sites), plus `svc` (14), are invisible. 71 of 157 edge dropped-error sites (45%) are outside the rule. The budget lists some of them (e.g. `confirm-admin-role/index.ts: 1` = `:71`, an `admin.rpc`), but the rule cannot flag a **new** one in those files. decisions.md section 4 names "a non-standard client name" as a known gap, but `admin` is the standard edge name. | A new `const { data } = await admin.from(...)` in any edge function passes lint. "Un-regressable" (ADR-0032) is true for about half the edge surface. | observed (rule source + tally) | Scratch tally over the grep output: roots `adminClient 16, svc 14, supabase 64, admin 55, userClient 5, sb 1, adminCheck 1, authClient 1` | ESLint not run (no node_modules); the claim the rule misses `admin` is read from its regex, not executed. | Widen `CLIENT_ROOT` to `^(supabase\|admin\|svc\|sb\|db\|.*[Cc]lient\|.*Admin)$`, re-baseline the budget once, and add RuleTester cases for `admin.rpc` and `svc.from` that must fail. |
| JA-7 | Q4 error (gate gap) | Med | `eslint-plugin-no-dropped-supabase-error.mjs:24-27, 59` | Scope is services, hooks, edge only. UI is excluded "because reads move into hooks in Phase 3". 25 UI dropped-error sites have no budget and no ratchet. | New UI dropped errors are only stopped by the coarser "UI must not access the database" rule, which a waived file escapes (JA-9). | observed | Plugin source `:59`; UI grep count above | - | Extend `SCOPED_ROOTS` to `src/components/` and `src/pages/` with a budget; it shrinks as ADR-0071 moves reads. |
| JA-8 | Q1 boundary | Med | `src/components/**`, `src/pages/**` | 52 UI files make 110 direct data calls; 88 files trip the gate rule. Progress since the prior audit: about 3 files. Business workflows still trapped in UI: `ClientsTab.tsx` (7 calls, CRUD + logo upload), `FleetyPlaybooksManager.tsx` (8 calls, CRUD for 2 tables), `UserAdminPage.tsx` (7), `ProjectFormPage.tsx` (5). | A schema or RLS change touches dozens of files; this is the class behind the ADR-0065 outage. | observed | UI grep above | Count is files, not severity. | Keep the ADR-0071 hook-per-table pattern; next targets by call count: FleetyPlaybooksManager, ClientsTab, UserAdminPage, ProjectFormPage. Prune each waiver in the same PR. |
| JA-9 | Q1 / gate integrity | Med | `scripts/ci/arch-gate.mjs:181-187` | Waivers are file-level with no count. 305 waivers hide 856 occurrences. A waived file can add more direct DB calls (or inline CORS, or service-role reads) and the `--changed` gate still passes. There is no stale-waiver check (13 stale today). | The backlog can grow inside waived files without anyone seeing it; the waiver file stops telling the truth. | observed | Code read; gate output "856 waived"; stale script | Did not prove an actual growth event happened. | Store a per-waiver `count` and fail when live count > count (shrink-only, like the dropped-error budget); fail on stale waivers. Add a smoke-test fixture where a waived file gains one call and the gate must fail. |
| JA-10 | Q1 boundary (edge) | Med | `supabase/functions/techfleet-chat/index.ts` (2490 lines), `notify-applicant-status` (758), `process-email-queue` (737), `ingest-reference-csv` (677), `freescout-proxy` (555) | `supabase/functions/CLAUDE.md` says "Handler is thin. Validate, call one unit of business logic, return." 101 of 125 functions have no module besides `index.ts`; 25 handlers are over 300 lines. 195 live edge waivers for hand-rolled CORS/auth. | Logic welded into `Deno.serve` cannot be unit-tested or reused, so it gets copied (see JA-11). | observed | PowerShell line count over `supabase/functions/*/index.ts` | Line count is a proxy; not every long handler is wrong. | Extract per function as touched (pattern already used by `handoff-produce/pipeline.ts`, `_shared/confirm-role.ts`). Optional gate: max handler length with a shrink-only budget. |
| JA-11 | Q2 ownership | Med | `freescout-proxy/index.ts:145-154`, `freescout-provision-customer/index.ts:74`, `process-freescout-events/index.ts:66-71`, `support-provisioning-retry/index.ts:97`, `_shared/support-ticket.ts:44-53` | Unchanged from prior. `profiles.freescout_customer_id` has 5 writers on 2 keys (`user_id` vs `id`). `freescout-proxy:145-154` is a copy of `_shared/support-ticket.ts:44-53` (find-or-create then write). Every one of those `update` awaits ignores the result. A second copy also lives in `support_ticket_pointers.freescout_customer_id`. | Duplicate Freescout customers or a lost link, with no signal because the writes drop errors. | observed | `rg "freescout_customer_id\s*:" supabase/functions` | Did not check whether Freescout dedupes by email. | `freescout-proxy` calls the `_shared` owner; the other 3 writers do too; take `{ error }` and report. Gate: arch-gate rule `freescout_customer_id\s*:` allowed only in `_shared/support-ticket.ts` (same shape as the `welcome_flow_completed_at` one-writer rule). |
| JA-12 | Q2 ownership | Low | `src/lib/auth/production-hosts.ts:9-13`, `supabase/functions/_shared/auth-hosts.ts:5-9`, plus `ALLOWED_ORIGINS` in `confirm-admin-role:18`, `confirm-teacher-role:18`, `public-classes:9`, `record-web-vital:32` | The production host list exists in 6 places. The two mirrored files carry "keep in sync" (waived) and are identical today, but nothing tests parity. | A new domain added in one place is rejected or mis-keyed in the others (Turnstile key, origin checks). | observed | `rg -i "keep (in\|these in\|them in\|it in) sync" src supabase`; `rg "(const\|let)\s+ALLOWED_ORIGINS" supabase/functions` | Did not diff the 4 ALLOWED_ORIGINS sets. | Edge fns import `_shared/auth-hosts.ts`; add a smoke test that reads both files and asserts equal sets. |
| JA-13 | Q4 error | Low | `supabase/functions/process-notification-fanout/index.ts:34-50` | Admin check: `catch { /* fall through */ }` and the `user_roles` read drops `error`. Fails closed (401), but an auth backend outage looks like "unauthorized" with no report. Also an inline role read (grandfathered in `check-no-inline-role-authz`). | Operators chase a permissions bug during an outage. | observed | Read the lines | - | Use `requireAdminRequest` from `_shared/request-auth.ts`, which reports. |
| JA-14 | Q3 dependency | Low | `src/services/explore.service.ts:23`, `src/lib/parse-explore-recommendations.ts:1` | Service and lib import types from `@/components/resources/*`. Domain types defined in the UI layer. | Deleting or reshaping a component breaks the service; arrows point the wrong way. | observed | `rg "from ['\"]@/(components\|pages\|hooks\|contexts)/" src/services src/lib src/domain` | Type-only, no runtime coupling. | Move `WebSearchResult` and `RecommendationData` to `src/types/` or the service. Gate: add `from ['"]@/components` to the services rule forbid list. |
| JA-15 | Q3 dependency | Low | 6 waived service files (`stats`, `announcement`, `push-subscription`, `error-reporter`, `discord-notify`, `CLAUDE.md`) | Unchanged from prior. | As prior: services need a browser shim to test. | observed | services web-global grep | - | As prior: route LKG caches through `src/lib/*`; relocate `error-reporter` globals to `lib/`. |
| JA-16 | Q4 / under-eng | Low | `src/features/class-curriculum/components/ItemEditorDialog.tsx:88`, `supabase/functions/_shared/feature-flags.ts:52-57`, `src/components/MyProjectsTab.tsx:218` | Failure shown as an empty or "off" state with no report. | A teacher sees "no attachments" and re-uploads; a flag outage reads as "disabled"; milestone chips go blank. | observed | Read the lines | - | Report then degrade (`reportError` then fallback). |
| JA-17 | Review process | Low | `docs/arch-reviews/log.jsonl` | The append-only review log has **1 entry** across 35 commits since 2026-10-09, many of them code PRs (#415, #421, #428, #432, #433, #439). `check-arch-review-coverage` is not in `scripts/ci`. Commit bodies claim "judge-arch PASS" (e.g. #415) with no logged matrix. | The judge half of the gate cannot be audited after the fact. | observed | `(Get-Content docs/arch-reviews/log.jsonl).Count` = 1; `git log --since=2026-10-09 --oneline` = 35 | Some PRs are docs/deps and need no review. | Append a record per code PR; adopt `check-arch-review-coverage` from the skill repo as advisory first. |
| JA-18 | Over-eng (watch) | Low | `scripts/ci/` (82 files), `src/test/smoke/` (246 files) | Not a violation. The guard estate is large and bespoke. Each guard is justified by a past incident, but gates like JA-6 and JA-9 show their precision is not always measured. | Guards that look strong but are partly blind give false confidence. | observed (counts) | `Get-ChildItem scripts/ci -File` | Did not review each guard's discrimination. | Keep, but require a discriminating fixture for each blind spot found (JA-6, JA-9). |

## Disconfirming-case-first checks (High findings)

**JA-1 (preconditions only in the UI).** Claim: the server does not enforce the Discord/scheduling
preconditions. I looked for the case where it does. (a) Read `notify-applicant-status/index.ts:395-645`:
the only server-side status guard is the `requires_interview` check at `:416-425`; the status update at
`:428` runs before any Discord lookup, and the Discord block at `:615+` is best-effort with no refusal.
(b) Searched migrations for a DB guard: `rg active_participant supabase/migrations` found only a
backfill and `handoff_is_active_member`; `rg "NEW\.applicant_status"` found only broadcast payloads.
(c) Checked for other UI callers: `rg notify-applicant-status src` found only this component. The claim
held. Residual: a DB function not named after the column could exist in prod only.

**JA-2 (applicant can self-write `applicant_status`).** Claim: repo migrations let an applicant write
their own `applicant_status`. Disconfirmers tried: (a) a later DROP or ALTER of the policy:
`rg "Users can update own project applications"` returns only the CREATE; `rg -i "ALTER POLICY"` 0 hits.
(b) A column-level grant: `rg -i "REVOKE UPDATE|GRANT UPDATE \("` 0 hits. (c) A trigger that pins the
column: the only BEFORE UPDATE triggers are `updated_at` and `protect_completed_status`, which pins
`status`/`completed_at`, not `applicant_status` (read `20260609014743_...sql:1-48`). (d) An insert
default plus check: none found. The repo-level claim held, so it stays High. It is `inferred`, not
`observed`, for production: prod has no migration ledger and hand-applied changes are common, so the
live `pg_policies` and `information_schema.column_privileges` for `project_applications` must be
queried before any fix. Query to upgrade it:
`select polname, cmd, qual, with_check from pg_policies where tablename='project_applications';`
plus `select grantee, privilege_type, column_name from information_schema.column_privileges where table_name='project_applications' and grantee='authenticated';`

## Prior findings, status

| Prior | Status now | Evidence |
|---|---|---|
| Q1 ~55 live UI files, 100 waivers | 52 files with calls (88 incl. client imports), 100 waivers (89 live, 11 stale). About 3 files better. | UI greps + stale script, observed |
| ADR-0071 PR2 #415 | MERGED 2026-10-09 (removed 1 waiver). PR3 #421 MERGED (5 components, 0 waivers removed). PR4 writes: not done (JA-4). | `git log`, `git show --stat`, observed |
| Q2 `freescout_customer_id` multi-writer | Unchanged, now with the duplicated helper and dropped writes named (JA-11). | observed |
| Q2 0 raw `profiles.update` in UI | Not re-run in full; `src/components/CLAUDE.md` rule unchanged. | not-assessed |
| Q3 6 waived web-global services | Unchanged (JA-15). | observed |
| Q4 ~10 dropped-error sites | Undercount. 31 `src` non-auth + 157 edge; ESLint blind to 45% of edge (JA-6) and all UI (JA-7). | observed |
| Waivers all undated | Fixed by #427: all dated, but a single 2027-04-30 cliff. | observed |
| Gate exit code UNVERIFIED | Now run: exit 0, 856 waived. | observed |

## Coverage

- Whole-tree greps over `src/**` and `supabase/functions/**` for every pattern in the counts table.
- Deep reads: ApplicantStatusDropdown, UserAdminPage (1-190), ProjectFormPage (330-465),
  MyProjectsTab (205-245, 455-495), notify-applicant-status (395-645), process-notification-fanout
  (1-70), confirm-admin-role (55-95), freescout writer sites (4 files), production-hosts and
  auth-hosts, 4 project_applications migrations, arch-gate.mjs (170-309), the ESLint plugin, and the
  budget-shrink guard. Plus about 60 catch sites through grep context.
- Not covered: per-file Q1 review of all 88 UI files; the 125 edge handlers beyond size and the
  sampled ones; `src/features/**` service quality; SQL functions for business logic placement.

## Limitations

1. No `tsc`, ESLint, vitest, or deno run (no node_modules). JA-6 is read from the rule's regex, not
   executed against a fixture.
2. All database claims (JA-2) come from repo migrations. Production state is not-assessed.
3. Counts are regex floors, not AST-exact.
4. Line counts stand in for "fat handler"; a long file can be well factored.
5. Scoring weights follow the prior audit so the delta is comparable; the -4 mixes measurement depth
   with real change and should not be read as regression alone.

## Fixes that need no prod access

JA-1 (server-side transition guard, Deno test), JA-3, JA-4 (ADR-0071 PR4), JA-5, JA-6 (widen ESLint
root regex + re-baseline + RuleTester cases), JA-7, JA-8, JA-9 (count-aware, stale-failing waivers),
JA-10, JA-11 (code side + one-writer arch-gate rule), JA-12 (parity test), JA-13 to JA-17.

## Blocked on prod access or a prod apply

JA-2 first needs a prod `pg_policies` / column-privilege query to confirm, then a migration with a
pgTAP test, hand-applied to prod (no prod migration CI). JA-1's DB-level variant (a transition trigger)
also needs a prod apply; the edge-function variant does not.

## Evidence ledger (headline claims)

| Claim | State | Source | Limitation |
|---|---|---|---|
| arch-gate full scan exits 0 with 856 waived | observed | `node scripts/ci/arch-gate.mjs` | Full scan; CI runs `--changed` |
| 305 waivers, all expire 2027-04-30, 13 stale | observed | node tally + stale script | Stale = no regex match today |
| 52 UI files make direct data calls | observed | ripgrep, counts table | Regex |
| 157 edge dropped-error sites, 71 outside the ESLint root regex | observed (grep), inferred (lint blindness) | ripgrep + tally; plugin `:57` | ESLint not executed |
| Discord/scheduling preconditions enforced only in UI | observed | file reads above | Prod-only DB code not seen |
| Applicant can write own `applicant_status` | inferred | migration greps above | Prod policies not queried |

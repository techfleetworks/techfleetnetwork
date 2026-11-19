# Public Access and Registration: Enterprise Architecture

Ticket 34c1a3bddce58092864bc1ac090fe335. Governs the public (logged-out and
logged-in) view of offerings, registration/purchase through Gumroad, and how
that relates to the internal training curriculum. This is the design that the
Phase A/B/C build plan (`BUILD-PLAN.md`) implements.

Deciders: product owner (mdenner), engineering. Date: 2026-11-18.

Related decision records: ADR 20261116-public-class-gateway, 20261116-public-visibility-auth-aware,
20261117-revoke-anon-classes-cohorts, 20261116-class-entitlement-ledger-projection,
20261116-gumroad-webhook-verify-by-callback, and the new governing ADR
20261118-public-domain-bounded-contexts.

---

## What "structurally impossible to fail" means here (read first)

No one can make software literally impossible to bug or fail. That is an honest
limit, not a hedge. What an architecture *can* do is make whole **classes** of
failure structurally impossible, by removing the path rather than guarding it:

- a leak path that does not exist cannot leak,
- a state that cannot be represented cannot be reached,
- a write that only one owner can perform cannot create a second disagreeing copy,
- a gate that fails closed cannot silently rot.

Every guarantee below is of that kind: a named failure class, closed by
construction, and proven by a test or gate that fails closed. The residual, a
novel logic bug no checklist names, is **shrunk** by the gate battery and
fresh-context review, not eliminated. That residual is stated in "The honest
limit" at the end.

---

## The domain is three bounded contexts, not one object

The confusion that drove this design ("classes and courses feel like two things
for the same data") is resolved by naming the bounded contexts. Each fact has
exactly one owner. Everyone else reads it; nobody writes a second copy.

| Bounded context | The real-world thing | Source of truth (sole writer) | Who reads it |
|---|---|---|---|
| **Catalog & Commerce** | An offering you can view and register for | `classes` + `cohorts` (the Class aggregate). `cohorts.registration_url` is the Gumroad link | Public gateways; entitlement projector (maps a sale to a cohort) |
| **Entitlement** | Who has paid for / may access a paid offering | `gumroad_sales` append-only ledger, projected to `class_registrations` by one `SECURITY DEFINER` projector | Content gate, admin console, stats, certificates |
| **Learning & Progress** (Course Modules) | The internal training journey a member completes | the course-module tables (`course_catalog` + `lesson_catalog`) + completions | The authenticated app (progress, Recruiting Center) |

Gumroad is a fourth, external context. It owns **payment**. The platform owns
**entitlement**. They meet at one Anti-Corruption Layer: the webhook (see
"Security").

### The current state: System A and System B are two distinct, unlinked systems

> Corrected by the 2026-11-18 skeptical audit. An earlier draft of this doc
> claimed the Core courses are classes and could be served by the class gateway
> (A8 dropped). That is **false** and reversed a recorded decision; see below.

There are two separate systems today, and the code confirms they are **not
linked**:

- **System A — Core Courses** (`course_catalog` + `lesson_catalog`): the internal
  training journey (Agile Mindset, Observer Course, Agile Teamwork, Project
  Training, Volunteer Teams, Discord Learning). `SELECT TO authenticated` only,
  progress-tracked, and **free by design — no price, no cohort, no Gumroad, no
  registration** (confirmed by the owner, 2026-11-18). You do not register for a
  Core course; you just access it. [`observed`: `classes` has no `course_key`;
  `course_catalog` has no `class_id`; no class is seeded for any Core course slug.]
- **System B — Classes** (`classes` + `cohorts`): the registerable offering, with
  the Gumroad link on the cohort.

Because the Course Modules are **not** classes and are not linked to classes, **the
class gateway cannot serve them.** A separate public projection over
`course_catalog`/`lesson_catalog` (BUILD-PLAN **A8**) is therefore **required** to
show the Core course list/outline to anonymous visitors. This matches the spec's
recorded decision (mdenner, 2026-11-16, "confirmed from code"): keep System A
separate and build A8, "NOT the full System A to B unification." B10's "Onboarding
Courses" tab is served by A8 (System A), not by the class gateway.

### Resolved (2026-11-18): keep separate — Core courses are free

The two systems stay separate, and A8 stands. **Core courses are free** (owner,
2026-11-18), so there is nothing to put on Gumroad and **no System A → B
unification** — bolting a payment path onto free content would be wrong, not an
improvement. Registration ("same data, same way, logged in or out") is a System B
(classes) concern only, and the class gateway already serves it auth-invariantly.

Open only as a wording choice, not an architecture one: the owner suggested calling
`course_catalog` "course modules," but the spec already uses "**modules**" for a
class's curriculum outline (`class_module_sections`, the D-C "module outline"). To
avoid the clash this doc uses "**Core Courses**" for `course_catalog`; a rename
needs a non-colliding term before it goes into the spec.

### "Same data, shown the same way, logged in or out" (open/closed serving)

The public offering payload is **auth-invariant for everything registration
needs**: title, summary, description, outcomes, cohort dates, and the Gumroad
`registration_url` are all in the anonymous `§6` set, so a logged-out and a
logged-in visitor see the identical offering and the identical Register action.

Authentication only **adds**, it never **diverges**: a signed-in member
additionally sees operational context (cohort capacity/status) and gets their
identity pre-filled for the entitlement claim. The registration data and the
Register-on-Gumroad call are the same for both. "Auth may widen the response but
never change the registration view" is the structural rule; `resolveAuthState`
fails safe to the anonymous set, so a forged or expired token can only ever show
*less*, never a different offering.

---

## The structural guarantees, by pillar

Each row is a failure **class**, the mechanism that removes its path, the skill
that owns the discipline, and the evidence state (per `skeptical-audit`:
`proven` = a fail-closed gate keeps it true on every change; `observed` = measured
this session; `documented`/`designed` = specified, not yet built).

### Security — remove the path, do not guard it

| Failure class removed | Mechanism (structural) | Skill | Evidence |
|---|---|---|---|
| A new column leaks to anon via `select=*` | **No anon DB path exists.** `REVOKE ALL ... FROM anon` on every §6 table; anon reads only through a service-role gateway | owasp, release-safety | A6 shipped for classes/cohorts (`observed`); extend to projects/clients (`designed`) |
| A non-allowlisted field reaches anon | One visibility Strategy (`public-visibility.ts`), frozen by `public-feed-contract.v1.json` + the A7 CI guard, both **fail-closed** | owasp, verifiable-quality-gates | `proven` (A7 guard + contract test + discriminating self-tests) |
| A forged/expired token widens the response | `resolveAuthState` returns anon on any invalid token; widening to authenticated is only reachable with a verified session | owasp | `observed` — unit tests cover the pure decision (`authStateFromUserResult`); the GoTrue token-rejection path is trusted, not mutation-gated here |
| Card/payment data breach | Gumroad owns payment; the platform stores only a sale **projection**, never card data | compliance, ACL | `documented` (we never hold a PAN) |
| A forged webhook grants access | Webhook is an **Anti-Corruption Layer**: verify-by-callback (re-fetch the sale from Gumroad) is the real auth; a raw ping alone grants nothing | owasp (Webhook_Security) | `designed` (ADR 20261116-gumroad-webhook-verify-by-callback) |
| A replayed webhook double-grants | Append-only ledger keyed on `sale_id UNIQUE`; the projector is idempotent | owasp, resilience | `designed` (entitlement ADR) |
| Account takeover by email guessing | Paid entitlement requires `email_confirmed_at IS NOT NULL` before access | owasp | `designed` (entitlement ADR) |

### Reliability — a fault does not become a failure

| Failure class removed | Mechanism | Skill | Evidence |
|---|---|---|---|
| A DB hiccup takes the public page down | Public reads are a **cacheable read projection** (edge cache + `stale-while-revalidate`); stale is served while the origin recovers | performance, resilience | `observed` (cache headers on the gateways) |
| Lost / reordered / duplicate webhooks corrupt entitlement | Append-only ledger + set-based projector + reconciliation sweep + drift tripwire → self-healing, **convergent** | resilience, entitlement ADR | `designed` |
| A quality gate quietly stops catching | Mutation gate: a change that neutralizes a guard fails the build | verifiable-quality-gates | `proven` (repo mutation gate) |
| A slow Gumroad API hangs a request | Timeout + budget on every out-of-process call; retry only transient failures | resilience | `designed` (reconcile/backfill) |

### Scale

| Driver | Mechanism | Skill | Evidence |
|---|---|---|---|
| Public = **unbounded anonymous** traffic (not the 767 members) | Anon reads absorbed by the edge cache before Postgres; the DB is not in the per-request hot path | performance | `observed` (SWR cache) |
| Read load grows independently of writes | CQRS: the `class_registrations` read model scales reads apart from the ledger writes | entitlement ADR | `designed` |
| Payload size / N+1 | Lean §6 selects; cohort and lesson reads batched, not per-row; partial indexes on `status`/`tier` | performance | `observed` (indexes exist) + `designed` (batching) |

### Maintainability

| Failure class removed | Mechanism | Skill | Evidence |
|---|---|---|---|
| Two copies of a fact drift apart | One owner per fact (offering = Class, entitlement = ledger, progress = Course Modules); linked by reference, never copied | enterprise-arch, judge-arch | `designed` (this doc) |
| A second way to serve public data | One gateway Strategy and one visibility policy for each system (System B classes via the class gateway; System A courses via the A8 projection), not scattered per-page auth checks | pattern-selector | `designed` |
| Business logic trapped behind a request | Depend inward: domain code never imports `request`/`response`; the gateway translates input to plain data | enterprise-arch (Clean Arch) | `proven` (arch-gate dependency rules) |

### Performance

Edge cache (60s + `stale-while-revalidate` 1 day), lean selects, batched reads,
and the existing partial indexes on `lesson_catalog(course_key) WHERE active AND
required` and `(phase)`. Load is stated honestly: the hot path is anonymous reads,
served from cache; writes (sales) are low-rate and asynchronous.

---

## The honest limit

- **"Structurally impossible" holds for the failure CLASSES above**, each closed
  by construction and proven by a fail-closed gate: anon column leak (no path),
  double-grant (unique + idempotent), card-data breach (never stored), guard rot
  (mutation gate), two copies of who-paid (single ledger).
- **It does not mean zero bugs.** A novel logic error in a projector, a
  mis-specified allowlist entry, or a Gumroad behavior change remains possible.
  These are shrunk by the gate battery, the drift tripwire, and fresh-context
  `judge-arch` review, not eliminated.
- **"100% in sync" means convergent eventual consistency, not real-time.** Two
  independent systems joined by an asynchronous webhook on a natural key (email)
  cannot be transactionally consistent. The guarantee is: no event lost
  (idempotent ledger + cron backfill against Gumroad's API), identity resolved
  whenever knowable, entitlement provably derived, drift detected and healed to
  zero. It is not a distributed transaction.

---

## Build-plan impact

| Plan item | Before | After this architecture |
|---|---|---|
| **A8** | Separate `public-courses` projection over `course_catalog`/`lesson_catalog` | **Required and kept** (my earlier "dropped" was wrong). System A Core courses are not classes, so the class gateway cannot serve them. Build A8 as the spec decided: service-role / `SECURITY DEFINER`, outline/metadata only. |
| **B10 "Onboarding Courses" tab** | Core-tier courses via A8 | **Unchanged**: the tab is served by the A8 System-A projection. A `SELECT TO authenticated` catalog cannot be served by the class gateway. |
| **B12 Core course pages** | `course_catalog` projection | **Unchanged**: Core course outline pages via A8 (section titles/order only, no lesson bodies). |
| **System A → B unification** | (not in the plan) | **Rejected.** Core courses are free (owner, 2026-11-18) — nothing to sell, so no Class/Gumroad for them. The two systems stay separate permanently. |
| **B13 entitlement** | Gumroad ledger projection | Unchanged and central: the single Entitlement context all offerings use. |

If, instead, product decides the Core training courses must become directly
sellable, that is an expand/contract migration giving them a Class (or
`class.kind = 'core_course'`) and a Gumroad link, recorded as its own ADR. Either
way there is one registerable object and one entitlement ledger.

---

## Skills applied

- **enterprise-architecture-standards** — three-concern lens (reliability,
  scalability, maintainability); DDD bounded contexts; one aggregate per owner;
  database-per-context; depend inward; size load in real numbers.
- **pattern-selector** — the serving/boundary patterns: Strategy (visibility),
  Gateway, Anti-Corruption Layer (webhook), CQRS + event-sourced Ledger
  (entitlement), Cache-Aside (edge). Recorded with forces, the simpler option
  rejected, and the failure each prevents, in ADR 20261118.
- **owasp-secure-coding-bdd** — the security guarantees and their `@security`
  scenarios; verify-by-callback; verified-email gate.
- **architectural-decision-records** — this design is captured in ADR 20261118
  (governing) alongside the existing public-access and entitlement ADRs.
- **release-deployment-safety** — expand/contract for the REVOKEs and any schema
  convergence; feature-flagged entitlement cutover.
- **compliance-data-lifecycle** — payment PII stays in Gumroad; the ledger carries
  retention/erasure duties already built for membership.
- **verifiable-quality-gates** — the A7 guard, feed-contract, and mutation gate are
  fail-closed and self-tested, so each "proven" above is real.
- **judge-arch** + **skeptical-audit** — every non-trivial change is reviewed in
  fresh context against the four questions, and every claim here carries an
  evidence state with the honest limit named.
